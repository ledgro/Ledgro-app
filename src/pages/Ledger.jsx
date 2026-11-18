import { sheetStyle } from '../hooks/useKeyboardInset';
import { toast } from 'sonner';
import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { logActivity } from '../lib/audit';
import { useInView } from 'react-intersection-observer';
import { collection, query, where, getDocs, getDoc, getDocFromServer, orderBy, limit, startAfter, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw, Search, ArrowLeftRight, Pencil, X, XCircle, Banknote, Smartphone, Wallet, ReceiptText, CalendarDays, ChevronLeft, ChevronRight, Undo2, Plus } from 'lucide-react';
import { Drawer } from 'vaul';
import { formatCurrency, cn, hapticVibrate } from '../lib/utils';
import { useBodyLock } from '../hooks/useBodyLock';
import { fetchAllPaged } from '../lib/firestoreUtils';
import { writeStats, voidEntries } from '../lib/dayStats';
import CatalogThumb from '../components/CatalogThumb';
import { bizDateFromKey, billDelta, bizDayKey, bizDayStart, bizDate, dayKey, negate, toDate } from '../lib/statsMath';
import { serverNow, CLOCK_MSG } from '../lib/clockDrift';
import { buildReport, rs } from '../lib/reportExport';
import { saveFile } from '../lib/shareFile';
import ExportMenu from '../components/ExportMenu';
import { useNameOf } from '../lib/memberNames';
import ExchangePicker from '../components/ExchangePicker';
import PaymentEditor from '../components/PaymentEditor';
import { exchangeTotals, replacementItems, netStockDeltas, flooredStockChange } from '../lib/exchange';
import { reserveBillNo } from '../lib/billNumber';
import { confirm } from '../lib/confirm';

const PAGE = 20; // bills per page; the next 20 load as you scroll to the bottom

const hapticOn = () => localStorage.getItem('ledgro_haptic') !== 'false';

function readRecentSearches() {
  try { return JSON.parse(localStorage.getItem('ledgro_recent_searches') || '[]'); } catch { return []; }
}

/** Unit price (paise) of one item after discounts, never NaN. */
const unitRefundOf = (item) => {
  const line = Number(item.finalLineTotal ?? item.lineTotal);
  const qty = Number(item.qty);
  return qty > 0 && Number.isFinite(line) ? line / qty : 0;
};

export default function Ledger() {
  const { user, shopId, shopName, isAdmin } = useAuth();
  const nameOf = useNameOf(shopId, user?.uid);
  const navigate = useNavigate();

  const [bills, setBills] = useState([]);
  const lastDoc = useRef(null);
  const { ref, inView } = useInView();
  const [hasMore, setHasMore] = useState(true);
  // '' = newest first across all days; otherwise one business day (yyyy-MM-dd)
  const [day, setDay] = useState('');
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [reversingId, setReversingId] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);
  const [processingReturn, setProcessingReturn] = useState(false);

  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('q') || '');
  const [activeFilter, setActiveFilter] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);

  const [isReturnDrawerOpen, setIsReturnDrawerOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [returnItems, setReturnItems] = useState({});
  const [refundEdits, setRefundEdits] = useState({}); // idx -> rupees per unit typed by the cashier
  /** Refund per unit in paise: what the cashier typed, never more than the customer paid. */
  const refundOf = (item, idx) => {
    const paid = unitRefundOf(item);
    const raw = refundEdits[idx];
    if (raw === undefined || raw === '') return paid;
    const v = Math.round(parseFloat(raw) * 100);
    return Number.isFinite(v) && v >= 0 ? Math.min(v, Math.round(paid)) : paid;
  };
  const [alreadyReturned, setAlreadyReturned] = useState({});
  const [refundMethod, setRefundMethod] = useState('cash');
  const [exchangeOn, setExchangeOn] = useState(false);
  const [exchangeLines, setExchangeLines] = useState([]);

  useBodyLock(!!selectedBill || isReturnDrawerOpen);
  const ledgerListRef = useRef(null);

  const shiftDay = (delta) => {
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDay(dayKey(d));
  };

  const fetchBills = useCallback(async (isNextPage = false) => {
    if (!shopId || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    try {
      const billsRef = collection(db, `shops/${shopId}/bills`);
      const range = [];
      if (day) {
        const start = bizDayStart(new Date(`${day}T00:00:00`));
        const end = new Date(start.getTime());
        end.setDate(end.getDate() + 1);
        range.push(where('createdAt', '>=', start), where('createdAt', '<', end));
      }
      const q = isNextPage && lastDoc.current
        ? query(billsRef, ...range, orderBy('createdAt', 'desc'), startAfter(lastDoc.current), limit(PAGE))
        : query(billsRef, ...range, orderBy('createdAt', 'desc'), limit(PAGE));

      const snap = await getDocs(q);
      const newBills = snap.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
        return { id: d.id, ...data, createdAt: { toDate: () => created } };
      });
      if (snap.docs.length) lastDoc.current = snap.docs[snap.docs.length - 1];
      setHasMore(snap.size === PAGE);

      if (isNextPage) {
        setBills((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          return [...prev, ...newBills.filter((b) => !existingIds.has(b.id))];
        });
      } else {
        setBills(newBills);
      }
    } catch (err) {
      console.error('Failed to fetch bills:', err);
      toast.error('Could not load bills. Check connection.');
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [shopId, day]);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (shopId) {
      lastDoc.current = null;
      setHasMore(true);
      setBills([]);
      fetchBills();
    }
  }, [shopId, fetchBills]);

  useEffect(() => {
    if (inView && hasMore && !loading && bills.length > 0) {
      fetchBills(true);
    }
  }, [inView, hasMore, loading, bills.length, fetchBills]);

  /** Only restock/bump catalog docs that still exist and actually track stock. */
  const addCatalogAdjustments = async (batch, items, { sign }) => {
    const qtyById = new Map();
    (items || []).forEach((item) => {
      if (!item.catalogId) return;
      qtyById.set(item.catalogId, (qtyById.get(item.catalogId) || 0) + (Number(item.qty) || 0));
    });
    const ids = [...qtyById.keys()];
    const snaps = await Promise.allSettled(ids.map((id) => getDoc(doc(db, `shops/${shopId}/catalog`, id))));
    snaps.forEach((res, i) => {
      if (res.status !== 'fulfilled' || !res.value.exists()) return;
      const data = res.value.data();
      const updates = {};
      if (typeof data.stockCount === 'number') updates.stockCount = increment(sign * qtyById.get(ids[i]));
      if (Object.keys(updates).length) batch.update(res.value.ref, { ...updates, updatedAt: serverTimestamp() });
    });
  };

  /** Void, edit and payment change: an admin within 24h, the cashier who made the bill within 1 hour. Rules enforce it again on save. */
  const inChangeWindow = (b) => {
    const created = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    // oxlint-disable-next-line react/purity
    const age = Date.now() - created;
    if (!created) return false;
    if (isAdmin) return age <= 24 * 60 * 60 * 1000;
    return b.creatorId === user?.uid && age <= 60 * 60 * 1000;
  };
  const canEditBill = (b) => {
    if (!b || (b.type && b.type !== 'sale') || b.isVoided || b.exchangeOf || (b.returnedAmt || 0) > 0) return false;
    return inChangeWindow(b);
  };

  /** Opens the bill in POS. Saving voids this bill and writes a new one (bills are never changed in place). */
  const handleEditBill = async (b) => {
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again.'); return; }
    if (!(await confirm({ title: 'Edit this bill?', message: 'Saving cancels the old bill and creates a new one with a new bill number.', confirmText: 'Edit' }))) return;
    const editBill = {
      id: b.id,
      type: b.type,
      items: b.items || [],
      subtotal: b.subtotal,
      grandTotal: b.grandTotal,
      globalDiscount: b.globalDiscount || null,
      globalDiscountAmt: b.globalDiscountAmt || 0,
      payment: b.payment || null,
      paymentMethod: b.paymentMethod || null,
      creatorId: b.creatorId,
      createdAt: b.createdAt.toDate(),
    };
    setSelectedBill(null);
    navigate('/pos', { state: { editBill } });
  };

  /** Fix a wrong payment method. Moves the bill's amount between cash/UPI in that day's stats, in one batch. */
  const handleChangePayment = async (bill, method, cashPaise) => {
    if (!shopId || !user || savingPayment) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const total = bill.grandTotal;
    const payment = {
      method,
      breakdown: {
        cash: method === 'cash' ? total : method === 'split' ? cashPaise : 0,
        upi: method === 'upi' ? total : method === 'split' ? total - cashPaise : 0,
      },
    };
    setSavingPayment(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, `shops/${shopId}/bills`, bill.id), { paymentMethod: method, payment });
      logActivity(batch, shopId, user.uid, { action: 'payment_change', billNo: bill.billNo, billId: bill.id, amount: total, note: `${bill.paymentMethod || '?'} to ${method}` });
      const key = bizDayKey(toDate(bill.createdAt));
      const next = { ...bill, paymentMethod: method, payment };
      writeStats(batch, shopId, [{ key, delta: negate(billDelta(bill)) }, { key, delta: billDelta(next) }]);
      await batch.commit();
      setBills((prev) => prev.map((b) => (b.id === bill.id ? next : b)));
      setSelectedBill(next);
      setEditingPayment(false);
      toast.success('Payment updated.');
    } catch (err) {
      console.error(err);
      toast.error(err?.code === 'permission-denied' ? 'Cannot change: only within 24h, by the bill creator or an admin, and not after a return.' : 'Failed to update payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleVoidBill = async (originalBill) => {
    if (!shopId || !user) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!(await confirm({ title: 'Void this bill?', message: 'The bill is cancelled and its stock is returned.', confirmText: 'Void bill', danger: true }))) return;
    if (hapticOn()) hapticVibrate(20);

    setReversingId(originalBill.id);
    try {
      const batch = writeBatch(db);
      const billRef = doc(db, `shops/${shopId}/bills`, originalBill.id);

      // Rules allow exactly this mutation: sale -> reversal.
      batch.update(billRef, {
        type: 'reversal',
        originalBillId: originalBill.id,
        reversedBy: user.uid,
        reversedAt: serverTimestamp(),
      });

      logActivity(batch, shopId, user.uid, { action: 'void', billNo: originalBill.billNo, billId: originalBill.id, amount: originalBill.grandTotal });
      await addCatalogAdjustments(batch, originalBill.items, { sign: 1 });
      writeStats(batch, shopId, await voidEntries(shopId, originalBill));
      await batch.commit();

      setBills((prev) => prev.map((b) => (b.id === originalBill.id ? { ...b, type: 'reversal', originalBillId: b.id, reversedBy: user.uid, reversedAt: new Date() } : b)));
      if (hapticOn()) hapticVibrate([50, 30, 50]);
    } catch (err) {
      console.error(err);
      if (hapticOn()) hapticVibrate([100, 50, 100]);
      const denied = err?.code === 'permission-denied';
      toast.error(denied ? 'Cannot void: only within 24h, by the bill creator or an admin.' : 'Failed to void bill.');
    } finally {
      setReversingId(null);
    }
  };

  // Load what was already returned for the open bill so we can't over-refund.
  /** Staff can return a sale for 24h; an admin any time. Rules enforce it again on save. */
  const canReturnBill = (b) => {
    if (isAdmin) return true;
    const created = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    // oxlint-disable-next-line react/purity
    return !!created && Date.now() - created <= 24 * 60 * 60 * 1000;
  };

  const openReturnDrawer = async () => {
    if (!selectedBill) return;
    setReturnItems({});
    setRefundEdits({});
    setAlreadyReturned({});
    setExchangeOn(false);
    setExchangeLines([]);
    setIsReturnDrawerOpen(true);
    try {
      const snap = await getDocs(query(
        collection(db, `shops/${shopId}/bills`),
        where('originalBillId', '==', selectedBill.id),
        limit(100),
      ));
      const returned = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.type !== 'return') return;
        (data.items || []).forEach((it) => {
          if (typeof it.idx === 'number') returned[it.idx] = (returned[it.idx] || 0) + (Number(it.qty) || 0);
        });
      });
      setAlreadyReturned(returned);
    } catch (err) {
      console.error('Could not load previous returns:', err);
    }
  };

  /** Exchange: one stock change per item (returned minus given), never below zero. */
  const addExchangeStock = async (batch, returnedItems, lines) => {
    const deltas = netStockDeltas(returnedItems, lines);
    const ids = [...deltas.keys()];
    const snaps = await Promise.allSettled(ids.map((id) => getDoc(doc(db, `shops/${shopId}/catalog`, id))));
    snaps.forEach((res, i) => {
      if (res.status !== 'fulfilled' || !res.value.exists()) return;
      const data = res.value.data();
      const change = flooredStockChange(data.stockCount, deltas.get(ids[i]));
      const updates = {};
      if (change) updates.stockCount = increment(change);
      if (lines.some((l) => l.catalogId === ids[i])) updates.frequency = increment(1);
      if (Object.keys(updates).length) batch.update(res.value.ref, { ...updates, updatedAt: serverTimestamp() });
    });
  };

  const handleProcessReturn = async () => {
    if (!selectedBill || !shopId || !user || processingReturn) return;

    const returnedItemsList = [];
    let returnTotal = 0;

    (selectedBill.items || []).forEach((item, idx) => {
      const maxQty = Math.max(0, (Number(item.qty) || 0) - (alreadyReturned[idx] || 0));
      const returnQty = Math.min(returnItems[idx] || 0, maxQty);
      if (returnQty > 0) {
        const lineRefund = Math.round(refundOf(item, idx) * returnQty);
        returnTotal += lineRefund;
        returnedItemsList.push({
          idx,
          catalogId: item.catalogId || null,
          name: item.name,
          unit: item.unit || null,
          unitPrice: item.unitPrice ?? item.unitPriceAtSale ?? 0,
          qty: returnQty,
          lineTotal: lineRefund,
        });
      }
    });

    if (returnedItemsList.length === 0 || returnTotal <= 0) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const exchanging = exchangeOn && exchangeLines.length > 0;
    let exch = null;
    if (exchanging) {
      if (exchangeLines.some((l) => !(Number(l.unitPrice) > 0) || !(Number(l.qty) > 0))) { toast.error('Enter a price for every replacement item.'); return; }
      const touched = new Set([...returnedItemsList, ...exchangeLines].map((i) => i.catalogId).filter(Boolean));
      if (touched.size > 5) { toast.error('Exchange up to 5 different items at a time.'); return; }
      exch = exchangeTotals(returnTotal, exchangeLines);
      const msg = exch.difference > 0 ? `Customer pays ${formatCurrency(exch.difference)}` : exch.difference < 0 ? `Refund ${formatCurrency(-exch.difference)}` : 'No money changes hands';
      if (!(await confirm({ title: 'Confirm exchange', message: `Returned ${formatCurrency(returnTotal)}\nGiven ${formatCurrency(exch.newTotal)}\n${msg} (${refundMethod.toUpperCase()})`, confirmText: 'Confirm' }))) return;
    } else if (!(await confirm({ title: 'Confirm refund', message: `Refund ${formatCurrency(returnTotal)} via ${refundMethod.toUpperCase()}.`, confirmText: 'Refund', danger: true }))) return;
    if (hapticOn()) hapticVibrate(20);

    setProcessingReturn(true);
    try {
      const batch = writeBatch(db);

      // Only keys allowed by firestore.rules for a return.
      const payload = {
        type: 'return',
        originalBillId: selectedBill.id,
        creatorId: user.uid,
        items: returnedItemsList,
        subtotal: -returnTotal,
        grandTotal: -returnTotal,
        paymentMethod: refundMethod,
        refundMethod,
        billNo: '', // set below from the credit-note series
        clientCreatedAt: Date.now(),
        createdAt: serverTimestamp(),
        ...(exchanging ? { exchangeOf: selectedBill.id } : {}),
      };

      const nowServer = await serverNow();
      const readServer = (ref) => getDocFromServer(ref);
      const creditNo = await reserveBillNo({ doc, db, shopId, date: nowServer, kind: 'R', read: readServer });
      payload.billNo = creditNo.billNo;
      batch.set(creditNo.ref, creditNo.data);

      const returnDocRef = doc(collection(db, `shops/${shopId}/bills`));
      batch.set(returnDocRef, payload);
      logActivity(batch, shopId, user.uid, { action: 'return', billNo: payload.billNo, billId: selectedBill.id, amount: returnTotal, note: exchanging ? 'exchange' : 'refund' });
      batch.update(doc(db, `shops/${shopId}/bills/${selectedBill.id}`), { returnedAmt: increment(returnTotal) });

      const dayKey0 = bizDayKey(nowServer);
      const statEntries = [{ key: dayKey0, delta: billDelta(payload) }];
      let saleDoc = null;
      if (exchanging) {
        const items = replacementItems(exchangeLines);
        const saleNo = await reserveBillNo({ doc, db, shopId, date: nowServer, kind: 'S', read: readServer });
        batch.set(saleNo.ref, saleNo.data);
        const salePayload = {
          type: 'sale',
          exchangeOf: selectedBill.id,
          creatorId: user.uid,
          items,
          subtotal: exch.newTotal,
          globalDiscount: { type: 'flat', value: 0 },
          globalDiscountAmt: 0,
          grandTotal: exch.newTotal,
          paymentMethod: refundMethod,
          payment: { method: refundMethod, breakdown: { cash: refundMethod === 'cash' ? exch.newTotal : 0, upi: refundMethod === 'upi' ? exch.newTotal : 0 } },
          shopName: shopName || '',
          billNo: saleNo.billNo,
          clientCreatedAt: new Date().toISOString(),
          createdAt: serverTimestamp(),
        };
        const saleRef = doc(collection(db, `shops/${shopId}/bills`));
        batch.set(saleRef, salePayload);
        statEntries.push({ key: dayKey0, delta: billDelta(salePayload) });
        saleDoc = { id: saleRef.id, ...salePayload, createdAt: { toDate: () => new Date() } };
        await addExchangeStock(batch, returnedItemsList, exchangeLines);
      } else {
        // Returned goods go back on the shelf (tracked items only).
        await addCatalogAdjustments(batch, returnedItemsList, { sign: 1 });
      }
      writeStats(batch, shopId, statEntries);
      await batch.commit();

      setBills((prev) => [...(saleDoc ? [saleDoc] : []), {
        id: returnDocRef.id,
        ...payload,
        createdAt: { toDate: () => new Date() },
      }, ...prev.map((b) => (b.id === selectedBill.id ? { ...b, returnedAmt: (b.returnedAmt || 0) + returnTotal } : b))]);

      setIsReturnDrawerOpen(false);
      setSelectedBill(null);
      if (hapticOn()) hapticVibrate([50, 30, 50]);
    } catch (e) {
      console.error(e);
      toast.error(e?.message === 'CLOCK' ? CLOCK_MSG : 'Failed to process return');
      if (hapticOn()) hapticVibrate([100, 50, 100]);
    } finally {
      setProcessingReturn(false);
    }
  };

  const saveRecentSearch = (term) => {
    if (!term.trim()) return;
    const newSearches = [term.trim(), ...recentSearches.filter((s) => s !== term.trim())].slice(0, 5);
    setRecentSearches(newSearches);
    try { localStorage.setItem('ledgro_recent_searches', JSON.stringify(newSearches)); } catch { /* storage blocked */ }
  };

  const processedBills = useMemo(() => {
    const reversedIds = new Set();
    bills.forEach((b) => { if (b.type === 'reversal' && b.originalBillId) reversedIds.add(b.originalBillId); });

    return bills.map((b) => ({ ...b, isVoided: reversedIds.has(b.id) })).filter((bill) => {
      if (!showVoided && bill.isVoided) return false;
      if (!showVoided && bill.type === 'reversal') return false;

      if (activeFilter) {
        if (activeFilter === 'return' && bill.type !== 'return') return false;
        if (activeFilter === 'cash' && (bill.paymentMethod !== 'cash' && bill.payment?.method !== 'cash')) return false;
        if (activeFilter === 'upi' && (bill.paymentMethod !== 'upi' && bill.payment?.method !== 'upi')) return false;
        if (activeFilter === 'split' && bill.payment?.method !== 'split') return false;
      }

      if (deferredQuery) {
        const q = deferredQuery.toLowerCase();
        const matchesSearch =
          (bill.billNo?.toLowerCase().includes(q)) ||
          (bill.grandTotal != null && (Math.abs(bill.grandTotal) / 100).toString().includes(q)) ||
          (bill.items?.some((item) => item.name?.toLowerCase().includes(q)));
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [bills, deferredQuery, activeFilter, showVoided]);

  // One block per business day, with that day's count and net total.
  const sections = useMemo(() => {
    const today = bizDayKey();
    const yd = bizDateFromKey(today); yd.setDate(yd.getDate() - 1);
    const yest = dayKey(yd);
    const map = new Map();
    processedBills.forEach((b) => {
      const when = b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
      const key = bizDayKey(when);
      if (!map.has(key)) map.set(key, { key, bills: [], total: 0, count: 0 });
      const sec = map.get(key);
      sec.bills.push(b);
      if (!b.isVoided && (b.type === 'sale' || b.type === 'return' || !b.type)) { sec.total += Number(b.grandTotal) || 0; sec.count += 1; }
    });
    return [...map.values()].map((sec) => {
      const d = bizDateFromKey(sec.key);
      const label = sec.key === today ? 'Today' : sec.key === yest ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      return { ...sec, label };
    });
  }, [processedBills]);

  const payParts = (b) => {
    const total = Number(b.grandTotal) || 0;
    if (b.payment?.method === 'split') return { cash: Number(b.payment.breakdown?.cash) || 0, upi: Number(b.payment.breakdown?.upi) || 0 };
    const m = b.refundMethod || b.paymentMethod || b.payment?.method;
    return m === 'upi' ? { cash: 0, upi: total } : { cash: total, upi: 0 };
  };

  // Totals for what is on screen (the loaded, filtered bills), so the numbers always match the list below.
  const summary = useMemo(() => {
    const out = { count: 0, total: 0, cash: 0, upi: 0 };
    processedBills.forEach((b) => {
      if (b.isVoided || !(b.type === 'sale' || b.type === 'return' || !b.type)) return;
      const parts = payParts(b);
      out.count += 1; out.total += Number(b.grandTotal) || 0; out.cash += parts.cash; out.upi += parts.upi;
    });
    return out;
  }, [processedBills]);

  const dayLabel = day ? bizDateFromKey(day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'All days';
  const filtersOn = !!(activeFilter || searchQuery.trim() || day || showVoided);
  const clearFilters = () => { setActiveFilter(''); setSearchQuery(''); setDay(''); setShowVoided(false); };
  const FILTERS = [['', 'All', null], ['cash', 'Cash', Banknote], ['upi', 'UPI', Smartphone], ['split', 'Split', Wallet], ['return', 'Returns', Undo2]];

  // Exports the WHOLE ledger (paged) as PDF, not just what is scrolled in.
  const handleExportLedger = async (format) => {
    if (!shopId) return;
    try {
      const docs = await fetchAllPaged(`shops/${shopId}/bills`);
      if (docs.length === 0) { toast.info('No bills to export.'); return; }
      const all = docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).reverse();
      const reversed = new Set(all.filter((b) => b.type === 'reversal' && b.originalBillId).map((b) => b.originalBillId));

      let total = 0;
      const rows = all.map((b) => {
        const status = reversed.has(b.id) ? 'Voided' : (b.type === 'reversal' ? 'Voided' : (b.type || 'sale'));
        const counts = status === 'sale' || status === 'return';
        if (counts) total += Number(b.grandTotal) || 0;
        const dateStr = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString() : '';
        const pay = b.payment?.method || b.paymentMethod || '';
        const items = (b.items || []).map((i) => `${i.name} x${i.qty}`).join(', ');
        return [b.billNo || b.id.slice(0, 8), dateStr, status, pay, rs(b.grandTotal), items];
      });

      const blob = await buildReport(format, {
        title: 'Bill History',
        subtitle: `${rows.length} bills`,
        kpis: [{ label: 'Bills listed', value: String(rows.length) }, { label: 'Net total', value: rs(total), tone: total >= 0 ? 'good' : 'bad' }],
        notes: ['Net total = sales minus returns. Voided bills are not counted.'],
        columns: [
          { label: 'Bill', w: 1.2, max: 18 }, { label: 'Date', w: 1.6, max: 24 }, { label: 'Status', w: 0.8, max: 10 },
          { label: 'Pay', w: 0.7, max: 8 }, { label: 'Total', w: 1.1, align: 'right', max: 18 }, { label: 'Items', w: 4, max: 70 },
        ],
        rows,
      });
      await saveFile(blob, `ledgro-bills-${Date.now()}.${format}`, 'Ledgro bills');
    } catch (err) {
      console.error(err);
      toast.error('Export failed. Check connection.');
    }
  };

  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 glass-header px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-black text-slate-900">History</h1>
          <ExportMenu label="PDF" onPick={handleExportLedger} className="glass-btn-flat h-10 gap-1.5 rounded-full px-4 text-sm font-bold active:scale-95 disabled:opacity-50" />
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input maxLength={60} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onBlur={() => saveRecentSearch(searchQuery)}
            placeholder="Search bill no, item or amount" aria-label="Search bills"
            className="glass-input block h-12 w-full rounded-full pl-11 pr-11 text-sm font-semibold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {searchQuery && (
            <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500"><X size={16} /></button>
          )}
        </div>

        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter by payment">
          {FILTERS.map(([key, label, Icon]) => {
            const on = activeFilter === key;
            return (
              <button type="button" key={label} aria-pressed={on} onClick={() => setActiveFilter(key)}
                className={cn('press flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold', on ? 'bg-blue-600 text-white shadow-md' : 'glass-btn-flat')}>
                {Icon && <Icon size={15} aria-hidden="true" />}{label}
              </button>
            );
          })}
          <button type="button" aria-pressed={showVoided} onClick={() => setShowVoided((v) => !v)}
            className={cn('press flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold', showVoided ? 'bg-slate-700 text-white' : 'glass-btn-flat')}>
            <XCircle size={15} aria-hidden="true" />Voided
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous day" disabled={!day} onClick={() => shiftDay(-1)} className="glass-btn disabled:opacity-40"><ChevronLeft size={18} /></button>
          <label className="glass-btn-flat relative flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold">
            <CalendarDays size={16} aria-hidden="true" className="flex-shrink-0" />
            <span className="truncate">{dayLabel}</span>
            <input type="date" aria-label="Pick a day" value={day} max={dayKey(bizDate())} onChange={(e) => setDay(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
          <button type="button" aria-label="Next day" disabled={!day || day >= dayKey(bizDate())} onClick={() => shiftDay(1)} className="glass-btn disabled:opacity-40"><ChevronRight size={18} /></button>
          {day && <button type="button" onClick={() => setDay('')} className="px-2 text-xs font-black uppercase tracking-wider text-blue-600">All</button>}
        </div>
      </header>

      <main className="flex-1 p-4">
        {!searchQuery && recentSearches.length > 0 && (
           <div className="mb-4 flex flex-wrap gap-2">
             <span className="text-xs font-bold text-slate-500 uppercase w-full">Recent Searches</span>
             {recentSearches.map(s => (
               <button key={s} onClick={() => setSearchQuery(s)} className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-semibold rounded-full active:bg-slate-300">
                 {s}
               </button>
             ))}
           </div>
        )}

        {processedBills.length > 0 && (
          <div className="glass-card mb-5 rounded-3xl p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{day ? dayLabel : 'Loaded bills'}{hasMore ? ' · loaded so far' : ''}</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{formatCurrency(summary.total)}</p>
              </div>
              <p className="pb-1 text-sm font-bold text-slate-500">{summary.count} {summary.count === 1 ? 'bill' : 'bills'}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-green-500/10 px-3 py-2"><p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-green-600"><Banknote size={13} aria-hidden="true" />Cash</p><p className="text-base font-black tabular-nums text-slate-900">{formatCurrency(summary.cash)}</p></div>
              <div className="rounded-2xl bg-blue-500/10 px-3 py-2"><p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-blue-500"><Smartphone size={13} aria-hidden="true" />UPI</p><p className="text-base font-black tabular-nums text-slate-900">{formatCurrency(summary.upi)}</p></div>
            </div>
          </div>
        )}

        {!searchQuery && recentSearches.length > 0 && (
           <div className="mb-4 flex flex-wrap gap-2">
             <span className="w-full text-xs font-bold uppercase text-slate-500">Recent searches</span>
             {recentSearches.map((q) => (
               <button key={q} onClick={() => setSearchQuery(q)} className="glass-btn-flat rounded-full px-3 py-1 text-xs font-semibold">{q}</button>
             ))}
           </div>
        )}

        {loading && bills.length === 0 ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading bills">
            {[0, 1, 2, 3].map((i) => <div key={i} className="glass-card h-[72px] animate-pulse rounded-2xl" />)}
          </div>
        ) : processedBills.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-16 text-center">
            <span className="glass-card mb-5 flex h-20 w-20 items-center justify-center rounded-full text-slate-400"><ReceiptText size={34} aria-hidden="true" /></span>
            <p className="text-lg font-black text-slate-900">{filtersOn ? 'No bills match' : 'No bills yet'}</p>
            <p className="mt-1 max-w-xs text-sm font-medium text-slate-500">{filtersOn ? 'Try another day or clear the filters.' : 'Every bill you make shows up here, newest first.'}</p>
            {filtersOn
              ? <button type="button" onClick={clearFilters} className="press glass-btn-flat mt-5 h-11 rounded-full px-6 text-sm font-bold">Clear filters</button>
              : <button type="button" onClick={() => navigate('/pos')} className="press mt-5 flex h-11 items-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-bold text-white shadow-md"><Plus size={16} aria-hidden="true" />Create a bill</button>}
          </div>
        ) : (
          <div className="space-y-6" ref={ledgerListRef}>
            {sections.map((sec) => (
              <section key={sec.key}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-black text-slate-900">{sec.label}</h2>
                  <span className="text-xs font-semibold text-slate-500">{sec.count} {sec.count === 1 ? 'bill' : 'bills'} · {formatCurrency(sec.total)}</span>
                </div>
                <div className="rise-list space-y-2">
                  {sec.bills.map((bill) => {
                    const time = bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Syncing…';
                    const isReturn = bill.type === 'return';
                    const method = bill.payment?.method === 'split' ? 'split' : (bill.refundMethod || bill.paymentMethod || bill.payment?.method || 'cash');
                    const Icon = isReturn ? Undo2 : method === 'upi' ? Smartphone : method === 'split' ? Wallet : Banknote;
                    const tone = bill.isVoided ? 'bg-slate-500/15 text-slate-500' : isReturn ? 'bg-orange-500/15 text-orange-500' : method === 'upi' ? 'bg-blue-500/15 text-blue-500' : method === 'split' ? 'bg-purple-500/15 text-purple-500' : 'bg-green-500/15 text-green-600';
                    const lines = (bill.items || []).filter((i) => i.name);
                    const shown = lines.slice(0, 3);
                    const more = lines.length - shown.length;
                    const title = isReturn ? (bill.exchangeOf ? 'Exchange' : 'Return') : (bill.billNo ? `Bill #${bill.billNo}` : 'Bill');
                    return (
                      <button type="button" key={bill.id} onClick={() => { setSelectedBill(bill); setReturnItems({}); setRefundEdits({}); }}
                        className={cn('press glass-card flex w-full items-center gap-3 rounded-2xl p-3 text-left', bill.isVoided && 'opacity-60')}>
                        <span className={cn('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl', tone)}><Icon size={20} aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-black text-slate-900">{title}</span>
                            {bill.isVoided && <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-xs font-black uppercase tracking-wider text-slate-500">Voided</span>}
                            {!isReturn && bill.exchangeOf && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-xs font-black uppercase tracking-wider text-blue-500">Exchange</span>}
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-slate-500">{time}{lines.length ? ` · ${lines.length} ${lines.length === 1 ? 'item' : 'items'}` : ''}</span>
                          {shown.length > 0 && (
                            <span className="mt-1 block space-y-0.5">
                              {shown.map((i, k) => <span key={k} className="flex gap-1.5 text-xs text-slate-600"><span className="truncate">{i.name}</span><span className="shrink-0 font-bold text-slate-500">×{i.qty}</span></span>)}
                              {more > 0 && <span className="block text-xs font-bold text-blue-600">+{more} more</span>}
                            </span>
                          )}
                        </span>
                        <span className="flex-shrink-0 text-right">
                          <span className={cn('block text-base font-black tabular-nums', bill.isVoided ? 'text-slate-500 line-through' : isReturn ? 'text-red-500' : 'text-slate-900')}>{formatCurrency(bill.grandTotal)}</span>
                          <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">{method}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {hasMore && bills.length > 0 && (
           <div ref={ref} className="py-8 text-center text-slate-500 font-semibold text-sm">
             {loading ? 'Loading more...' : 'Scroll for more'}
           </div>
        )}
      </main>

      <Drawer.Root handleOnly repositionInputs={false} open={!!selectedBill && !isReturnDrawerOpen} onOpenChange={(open) => { if (!open) { setSelectedBill(null); setEditingPayment(false); } }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} className="bg-slate-50 flex flex-col rounded-t-[24px] mt-24 h-[85dvh] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none overflow-hidden">
            <div className="p-4 bg-slate-50 flex-1 overflow-y-auto pb-safe">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />

              {selectedBill && (
                <div className="max-w-md mx-auto space-y-6">
                  <div className="text-center">
                    <h2 className={cn("text-3xl font-black mb-1", selectedBill.isVoided ? "text-slate-500 line-through" : selectedBill.type === 'return' ? "text-red-600" : "text-slate-900")}>
                      {formatCurrency(selectedBill.grandTotal)}
                    </h2>
                    <p className="text-slate-500 font-medium text-sm">{selectedBill.createdAt?.toDate ? selectedBill.createdAt.toDate().toLocaleString() : 'Pending'}</p>
                    <p className="text-xs text-slate-500 font-mono mt-1">#{selectedBill.billNo || selectedBill.id.substring(0,8)}</p>
                    <p className="text-xs text-slate-500 mt-1">By {nameOf(selectedBill.creatorId)}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 divide-y divide-slate-50">
                    <h3 className="font-bold text-slate-500 uppercase tracking-wider text-xs mb-3 pb-2">Itemized List</h3>
                    {selectedBill.items?.map((item, idx) => (
                      <div key={idx} className="py-2.5 flex justify-between items-start gap-3">
                        <CatalogThumb catalogId={item.catalogId} className="h-12 w-12" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs font-medium text-slate-500">{item.qty} x {formatCurrency(item.unitPriceAtSale || item.unitPrice)}</p>
                          {item.listPrice != null && item.listPrice !== (item.unitPriceAtSale || item.unitPrice) && (
                            <p className="text-xs font-bold text-amber-700">Price changed from {formatCurrency(item.listPrice)}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">{formatCurrency(item.finalLineTotal ?? item.lineTotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedBill.type !== 'return' && selectedBill.type !== 'reversal' && !selectedBill.isVoided && (
                    editingPayment ? (
                      <PaymentEditor
                        method={selectedBill.payment?.method || selectedBill.paymentMethod || 'cash'}
                        cash={selectedBill.payment?.breakdown?.cash || 0}
                        total={selectedBill.grandTotal}
                        saving={savingPayment}
                        onSave={(m, c) => handleChangePayment(selectedBill, m, c)}
                        onCancel={() => setEditingPayment(false)}
                      />
                    ) : (
                      <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid via</p>
                          <p className="font-bold uppercase text-slate-900">
                            {selectedBill.payment?.method === 'split'
                              ? `Split · Cash ${formatCurrency(selectedBill.payment.breakdown?.cash)} + UPI ${formatCurrency(selectedBill.payment.breakdown?.upi)}`
                              : (selectedBill.payment?.method || selectedBill.paymentMethod || 'cash')}
                          </p>
                        </div>
                        {canEditBill(selectedBill) && (
                          <button type="button" onClick={() => setEditingPayment(true)} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 active:bg-slate-200">Change</button>
                        )}
                      </div>
                    )
                  )}

                  {!selectedBill.isVoided && (!selectedBill.type || selectedBill.type === 'sale') && !canEditBill(selectedBill) && (
                    <p className="mb-3 rounded-xl bg-slate-500/10 px-3 py-3 text-center text-xs font-bold leading-5 text-slate-500">
                      {selectedBill.exchangeOf ? 'This bill came from an exchange, so it cannot be edited or voided.'
                        : (selectedBill.returnedAmt || 0) > 0 ? 'Items were already returned on this bill, so it cannot be edited or voided.'
                        : `Bills can be edited or voided for ${isAdmin ? '24 hours' : '1 hour'} after they are made (${isAdmin ? 'owner' : 'cashier'}). This one is older. Use Return Items for a refund.`}
                    </p>
                  )}

                  {!selectedBill.isVoided && selectedBill.type !== 'return' && selectedBill.type !== 'reversal' && (
                     <div className="grid grid-cols-2 gap-3">
                       {canEditBill(selectedBill) && (
                         <button
                           onClick={() => handleEditBill(selectedBill)}
                           className="col-span-2 w-full bg-blue-50 text-blue-700 font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-blue-100 transition-colors shadow-sm"
                         >
                           <Pencil size={20} /> Edit Bill
                         </button>
                       )}
                       {canReturnBill(selectedBill) ? (
                       <button
                         onClick={openReturnDrawer}
                         className="w-full bg-orange-50 text-orange-600 font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-orange-100 transition-colors shadow-sm"
                       >
                         <ArrowLeftRight size={20} /> Return Items
                       </button>
                       ) : (
                       <p className="w-full rounded-xl bg-slate-50 px-3 py-3 text-center text-xs font-bold text-slate-500">Returns after 24 hours need an admin.</p>
                       )}
                       {!(selectedBill.returnedAmt > 0) && !selectedBill.exchangeOf && inChangeWindow(selectedBill) && (
                       <button
                         onClick={() => { handleVoidBill(selectedBill); setSelectedBill(null); }}
                         disabled={reversingId === selectedBill.id}
                         className="w-full bg-red-50 text-red-600 font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-red-100 transition-colors shadow-sm disabled:opacity-50"
                       >
                         <RefreshCcw size={20} /> Void Full Bill
                       </button>
                       )}
                     </div>
                  )}
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <Drawer.Root handleOnly repositionInputs={false} open={isReturnDrawerOpen} onOpenChange={(open) => { setIsReturnDrawerOpen(open); if(!open) setSelectedBill(null); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} className="bg-slate-50 flex flex-col rounded-t-[24px] mt-24 h-[90dvh] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none overflow-hidden">
             <div className="p-4 bg-slate-50 flex-1 overflow-y-auto pb-safe">
               <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
               <h2 className="text-2xl font-black text-slate-900 mb-2">Process Return</h2>
               <p className="text-sm text-slate-500 font-medium mb-6">Select the quantity of items being returned by the customer.</p>

               {selectedBill && (
                 <div className="space-y-4">
                   <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                     {selectedBill.items.map((item, idx) => {
                        const currentReturnQty = returnItems[idx] || 0;
                        const maxQty = Math.max(0, (Number(item.qty) || 0) - (alreadyReturned[idx] || 0));
                        return (
                          <div key={idx} className="p-4 flex items-center justify-between">
                            <div className="flex-1">
                               <p className="font-bold text-slate-900">{item.name}</p>
                               <p className="text-xs text-slate-500">Max qty: {maxQty}{alreadyReturned[idx] ? ` (${alreadyReturned[idx]} already returned)` : ''} • {formatCurrency(Math.round(unitRefundOf(item)))} paid each</p>
                               {currentReturnQty > 0 && (
                                 <label className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                                   Refund each ₹
                                   <input type="number" inputMode="decimal" min="0" step="0.01" value={refundEdits[idx] ?? ''} placeholder={(unitRefundOf(item) / 100).toString()}
                                     onChange={(e) => setRefundEdits((prev) => ({ ...prev, [idx]: e.target.value.slice(0, 9) }))}
                                     className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-900" />
                                 </label>
                               )}
                            </div>
                            <div className="flex items-center gap-3">
                               <button
                                 onClick={() => setReturnItems(prev => ({...prev, [idx]: Math.max(0, currentReturnQty - 1)}))}
                                 className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-black active:bg-slate-200 flex items-center justify-center"
                               >-</button>
                               <span className="font-bold text-lg w-4 text-center">{currentReturnQty}</span>
                               <button
                                 onClick={() => setReturnItems(prev => ({...prev, [idx]: Math.min(maxQty, currentReturnQty + 1)}))}
                                 className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-black active:bg-slate-200 flex items-center justify-center"
                               >+</button>
                            </div>
                          </div>
                        )
                     })}
                   </div>

                   <div>
                     <p className="text-sm font-bold text-slate-700 mb-2">{exchangeOn ? 'Payment / Refund Method' : 'Refund Method'}</p>
                     <div className="flex bg-slate-200 p-1 rounded-xl">
                       <button onClick={() => setRefundMethod('cash')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", refundMethod==='cash' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>Cash</button>
                       <button onClick={() => setRefundMethod('upi')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", refundMethod==='upi' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>UPI</button>
                     </div>
                   </div>

                   <label className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 h-12 font-bold text-slate-700">
                     <input type="checkbox" checked={exchangeOn} onChange={(e) => setExchangeOn(e.target.checked)} className="w-5 h-5" />
                     Exchange for other items
                   </label>
                   {exchangeOn && (
                     <ExchangePicker
                       lines={exchangeLines}
                       setLines={setExchangeLines}
                       oldUnitPrice={(() => {
                         const fi = (selectedBill.items || []).findIndex((_, idx) => (returnItems[idx] || 0) > 0);
                         return fi >= 0 ? Math.round(refundOf(selectedBill.items[fi], fi)) : 0;
                       })()}
                     />
                   )}
                   {exchangeOn && exchangeLines.length > 0 && (() => {
                     const ret = (selectedBill.items || []).reduce((sum, item, idx) => sum + Math.round(refundOf(item, idx) * Math.min(returnItems[idx] || 0, Math.max(0, (Number(item.qty) || 0) - (alreadyReturned[idx] || 0)))), 0);
                     const { newTotal, difference } = exchangeTotals(ret, exchangeLines);
                     return (
                       <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 text-sm font-semibold">
                         <div className="flex justify-between text-slate-500"><span>Returned</span><span>{formatCurrency(ret)}</span></div>
                         <div className="flex justify-between text-slate-500"><span>Given</span><span>{formatCurrency(newTotal)}</span></div>
                         <div className="flex justify-between text-base font-black text-slate-900 pt-1 border-t border-slate-100">
                           <span>{difference >= 0 ? 'Customer pays' : 'Refund'}</span><span>{formatCurrency(Math.abs(difference))}</span>
                         </div>
                       </div>
                     );
                   })()}

                   <button
                     onClick={handleProcessReturn}
                     disabled={processingReturn || Object.values(returnItems).every(v => !v)}
                     className="w-full mt-4 bg-orange-600 text-white font-bold h-14 rounded-xl active:bg-orange-700 disabled:opacity-50"
                   >
                     {processingReturn ? 'Processing…' : exchangeOn && exchangeLines.length > 0 ? 'Confirm Exchange' : 'Confirm Return'}
                   </button>
                 </div>
               )}
             </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
