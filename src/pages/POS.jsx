import { toast } from 'sonner';
import { useReducer, useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { useCatalogLoader } from '../hooks/useCatalogLoader';
import { generateBillNumber } from '../lib/billNumber';
import { writeStats, voidEntries } from '../lib/dayStats';
import { billDelta, bizDayKey } from '../lib/statsMath';
import { serverNow, CLOCK_MSG } from '../lib/clockDrift';
import { collection, getDoc, runTransaction, doc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Tag, Share2, PlusCircle, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSpring, animated } from '@react-spring/web';

import SearchSheet from '../components/SearchSheet';
import QuickPicks from '../components/QuickPicks';
import CartItem from '../components/CartItem';
import DiscountDrawer from '../components/DiscountDrawer';
import Receipt, { RECEIPT_PX } from '../components/Receipt';
import { billReducer, initialBillState, calculateBillTotals } from '../reducers/billReducer';
import BottomNav from '../components/BottomNav';

import { useLocation, useNavigate } from 'react-router-dom';
import { formatCurrency, hapticVibrate, sanitizeText } from '../lib/utils';
import { shareFile, saveFile, canvasToBlob, canvasToPdfBlob } from '../lib/shareFile';
import { confirm } from '../lib/confirm';

const COMMIT_TIMEOUT_MS = 15000;
const normName = (s) => String(s || '').normalize('NFC').trim().toLowerCase();

export default function POS() {
  const { user, shopId, shopName, shopProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const addCatalogItem = useCatalogStore((s) => s.addItem);

  const [state, dispatch] = useReducer(billReducer, initialBillState);
  const isSubmittingRef = useRef(false);
  // Same bill doc id is reused if a slow commit is retried, so a bill can never be saved twice.
  const pendingBillRefRef = useRef(null);
  const timedOutRef = useRef(false);
  const receiptRef = useRef(null);

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [lastBill, setLastBill] = useState(null);
  const [receiptFormat, setReceiptFormat] = useState('png'); // 'png' | 'pdf'
  const [receiptFiles, setReceiptFiles] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(() => (localStorage.getItem('ledgro_defaultPayment') === 'upi' ? 'upi' : 'cash')); // 'cash' | 'upi' | 'split'
  const [splitCash, setSplitCash] = useState('');
  const [tendered, setTendered] = useState(''); // cash handed over, for the change line only. Never saved.
  const [isPayOpen, setIsPayOpen] = useState(false);

  const { items, subtotal, globalDiscountAmt, grandTotal } = useMemo(() => calculateBillTotals(state), [state]);

  useEffect(() => {
    window.__LEDGRO_UID__ = user?.uid;
    window.__LEDGRO_SHOPID__ = shopId;
  }, [user?.uid, shopId]);

  useEffect(() => {
    window.__LEDGRO_CART_STATE__ = state;
    window.__LEDGRO_CHECKOUT_ACTIVE__ = isCheckingOut;
  }, [state, isCheckingOut]);

  useEffect(() => () => {
    window.__LEDGRO_CART_STATE__ = null;
    window.__LEDGRO_CHECKOUT_ACTIVE__ = false;
  }, []);

  useEffect(() => {
    const recovered = localStorage.getItem('ledgro-cart-recovery');
    if (!recovered) return;
    try {
      const { cartState, savedAt, uid, shopId: savedShopId } = JSON.parse(recovered);
      localStorage.removeItem('ledgro-cart-recovery');
      // Only restore if it belongs to the current user and shop
      if (uid !== user?.uid || savedShopId !== shopId) return;
      const ageMs = Date.now() - new Date(savedAt).getTime();
      if (ageMs < 5 * 60 * 1000 && cartState?.items?.length) { // Only restore if less than 5 mins old
        dispatch({ type: 'INIT_FROM_EDIT', payload: { items: cartState.items, globalDiscount: cartState.globalDiscount } });
        toast.success('Cart restored after app update');
      }
    } catch {
      localStorage.removeItem('ledgro-cart-recovery');
    }
  }, [user?.uid, shopId]);

  const springTotal = useSpring({ val: grandTotal, config: { stiffness: 200, damping: 20 } });
  const editBill = location.state?.editBill || null;

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (editBill && state.items.length === 0 && !checkoutSuccess) {
      dispatch({ type: 'INIT_FROM_EDIT', payload: editBill });

      if (editBill.payment?.method === 'split') {
        setPaymentMethod('split');
        setSplitCash(((editBill.payment.breakdown?.cash || 0) / 100).toString());
      } else {
        setPaymentMethod(editBill.paymentMethod || 'cash');
      }

      // Clear location state so refresh doesn't trigger edit mode again
      window.history.replaceState({}, document.title);
    }
  }, [editBill, state.items.length, checkoutSuccess]);

  useCatalogLoader(shopId, { force: true });

  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [activeDiscountItem, setActiveDiscountItem] = useState(null);

  const cartQty = useMemo(() => {
    const m = new Map();
    items.forEach((i) => { if (i.catalogId) m.set(i.catalogId, (m.get(i.catalogId) || 0) + (Number(i.qty) || 0)); });
    return m;
  }, [items]);

  const handleAddItem = (item) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
    if (localStorage.getItem('ledgro_haptic') !== 'false') {
      hapticVibrate(10);
    }
    if (!item.catalogId) {
      addCatalogItem({ name: item.name, lastUsedPrice: item.unitPriceAtSale, unit: item.unit || 'piece' });
    }
  };

  const handleRemoveOne = (catalogId) => {
    const line = [...state.items].reverse().find((i) => i.catalogId === catalogId);
    if (!line) return;
    const step = ['kg', 'l', 'litre', 'liter'].includes(line.unit) ? 0.5 : 1;
    if (line.qty - step >= step) dispatch({ type: 'UPDATE_QTY', payload: { id: line.id, qty: line.qty - step } });
    else dispatch({ type: 'REMOVE_ITEM', payload: { id: line.id } });
  };

  const clearBill = async () => {
    if (!(await confirm({ title: 'Clear bill?', message: 'All items will be removed from this bill.', confirmText: 'Clear', danger: true }))) return;
    dispatch({ type: 'CLEAR_BILL' });
  };

  const openLineDiscount = (item) => {
    setActiveDiscountItem(item);
    setIsDiscountOpen(true);
  };

  const openGlobalDiscount = () => {
    setActiveDiscountItem(null);
    setIsDiscountOpen(true);
  };

  const handleCheckout = async () => {
    if (items.length === 0 || !shopId || isSubmittingRef.current) return;

    // UPI: the amount typed is what the customer really paid. If it is less than the bill, the gap becomes a discount.
    const upiPaid = paymentMethod === 'upi' && tendered !== '' ? Math.round((parseFloat(tendered) || 0) * 100) : 0;
    const billState = upiPaid > 0 && upiPaid < grandTotal
      ? { ...state, globalDiscount: { type: 'flat', value: globalDiscountAmt + (grandTotal - upiPaid) } }
      : state;
    const { grandTotal: billTotal, globalDiscountAmt: billDiscountAmt } = calculateBillTotals(billState);

    const cashPaise = paymentMethod === 'split' ? Math.round((parseFloat(splitCash) || 0) * 100) : 0;
    if (paymentMethod === 'split' && (cashPaise <= 0 || cashPaise >= billTotal)) {
      toast.error('Enter a cash amount between 0 and the bill total.');
      return;
    }

    const catalogItems = useCatalogStore.getState().items;
    const catalogMap = new Map(catalogItems.filter((c) => c.id).map((c) => [c.id, c]));
    const catalogByName = new Map(catalogItems.filter((c) => c.id).map((c) => [normName(c.name), c]));

    const newCatalog = new Map();
    const resolved = items.map((line) => {
      let catalogId = line.catalogId && catalogMap.has(line.catalogId) ? line.catalogId : null;
      if (!catalogId) {
        const key = normName(line.name);
        const existing = catalogByName.get(key);
        if (existing) {
          catalogId = existing.id;
        } else {
          let fresh = newCatalog.get(key);
          if (!fresh) {
            const ref = doc(collection(db, `shops/${shopId}/catalog`));
            fresh = { id: ref.id, ref, name: String(line.name).slice(0, 100), price: line.unitPriceAtSale, unit: line.unit || 'unit' };
            newCatalog.set(key, fresh);
          }
          catalogId = fresh.id;
        }
      }
      return { ...line, catalogId };
    });

    const soldQty = new Map();
    resolved.forEach((l) => soldQty.set(l.catalogId, (soldQty.get(l.catalogId) || 0) + (Number(l.qty) || 0)));

    // Stock never blocks a sale: shops often sell items they haven't entered stock for
    // (or borrow from another branch). Tracked stock simply floors at 0.

    setIsCheckingOut(true);
    isSubmittingRef.current = true;

    try {
      const paymentData = {
        method: paymentMethod,
        breakdown: {
          cash: paymentMethod === 'split' ? cashPaise : (paymentMethod === 'cash' ? billTotal : 0),
          upi: paymentMethod === 'split' ? billTotal - cashPaise : (paymentMethod === 'upi' ? billTotal : 0),
        },
      };

      // Snapshot the bill (no undefined values: Firestore rejects them)
      const payload = {
        creatorId: user.uid,
        items: resolved.map((i) => ({
          name: sanitizeText(i.name),
          catalogId: i.catalogId,
          unit: i.unit || 'unit',
          unitPrice: i.unitPriceAtSale,
          qty: i.qty,
          rawTotal: i.rawTotal,
          lineDiscount: i.lineDiscount,
          finalLineTotal: i.finalLineTotal,
        })),
        subtotal,
        globalDiscount: billState.globalDiscount,
        globalDiscountAmt: billDiscountAmt,
        grandTotal: billTotal,
        paymentMethod, // legacy string, keeping for backwards compatibility
        payment: paymentData,
        shopName: shopName || '',
        billNo: generateBillNumber(user.uid),
        clientCreatedAt: new Date().toISOString(),
        createdAt: serverTimestamp(), // critical for offline ledger ordering
      };

      // Writes are collected, then applied in one transaction so stock is read fresh from the server.
      const ops = [];
      const batch = { set: (ref, data, opt) => ops.push(['set', ref, data, opt]), update: (ref, data) => ops.push(['update', ref, data]) };
      if (!pendingBillRefRef.current) pendingBillRefRef.current = doc(collection(db, `shops/${shopId}/bills`));
      const newBillRef = pendingBillRefRef.current;
      batch.set(newBillRef, payload);
      const statEntries = [{ key: bizDayKey(await serverNow()), delta: billDelta(payload) }];

      // Stock/frequency bookkeeping, one write per catalog doc
      const stockDelta = new Map();
      soldQty.forEach((qty, id) => stockDelta.set(id, -qty));

      if (editBill) {
        statEntries.push(...(await voidEntries(shopId, editBill)));
        batch.update(doc(db, `shops/${shopId}/bills`, editBill.id), {
          type: 'reversal',
          originalBillId: editBill.id,
          reversedBy: user.uid,
          reversedAt: serverTimestamp(),
        });
        (editBill.items || []).forEach((old) => {
          if (old.catalogId && catalogMap.has(old.catalogId)) {
            stockDelta.set(old.catalogId, (stockDelta.get(old.catalogId) || 0) + (Number(old.qty) || 0));
          }
        });
      }

      // Stock and frequency are decided inside the transaction, from the server's current numbers.
      const stockPlan = [];
      new Set([...soldQty.keys(), ...stockDelta.keys()]).forEach((id) => {
        if (!catalogMap.has(id)) return;
        stockPlan.push({ id, bumpFreq: !editBill && soldQty.has(id), want: stockDelta.get(id) || 0 });
      });

      newCatalog.forEach((fresh) => {
        batch.set(fresh.ref, {
          name: fresh.name,
          lastUsedPrice: fresh.price,
          unit: fresh.unit,
          isActive: true,
          frequency: editBill ? 0 : 1,
          stockCount: null,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      writeStats(batch, shopId, statEntries);

      let localCatalogUpdates = [];
      // Online-only: wait for the server's verdict. A bill is NEVER shown as success unless
      // the server accepted it. The same bill id is reused on retry, so no duplicates.
      if (!navigator.onLine) throw new Error('OFFLINE');
      // After a timeout the first attempt may have landed. If the bill exists, do not write again.
      let alreadySaved = false;
      if (timedOutRef.current) {
        try { alreadySaved = (await getDoc(newBillRef)).exists(); } catch { /* treat as not saved */ } { /* treat as not saved */ }
      }
      if (!alreadySaved) {
        await Promise.race([
          runTransaction(db, async (tx) => {
            localCatalogUpdates = [];
            const reads = await Promise.all(stockPlan.map((p) => tx.get(doc(db, `shops/${shopId}/catalog`, p.id))));
            reads.forEach((snap, i) => {
              if (!snap.exists()) return;
              const { id, bumpFreq, want } = stockPlan[i];
              const cur = snap.data();
              const updates = {};
              if (bumpFreq) updates.frequency = increment(1);
              let delta = want;
              if (cur.stockCount != null && delta < 0) delta = Math.max(delta, -Math.max(0, cur.stockCount)); // floor at 0
              if (cur.stockCount != null && delta !== 0) updates.stockCount = increment(delta);
              if (Object.keys(updates).length) {
                tx.update(snap.ref, { ...updates, updatedAt: serverTimestamp() });
                localCatalogUpdates.push({
                  id,
                  name: cur.name,
                  ...(updates.frequency ? { frequency: (cur.frequency || 0) + 1 } : {}),
                  ...(updates.stockCount ? { stockCount: cur.stockCount + delta } : {}),
                });
              }
            });
            ops.forEach(([kind, ref, data, opt]) => (kind === 'set' ? (opt ? tx.set(ref, data, opt) : tx.set(ref, data)) : tx.update(ref, data)));
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), COMMIT_TIMEOUT_MS)),
        ]);
      }
      pendingBillRefRef.current = null;
      timedOutRef.current = false;

      // Keep the local catalog in step with what we just wrote
      localCatalogUpdates.forEach((u) => addCatalogItem(u));
      newCatalog.forEach((fresh) => addCatalogItem({
        id: fresh.id, name: fresh.name, lastUsedPrice: fresh.price, unit: fresh.unit, isActive: true, frequency: editBill ? 0 : 1, stockCount: null,
      }));

      if (localStorage.getItem('ledgro_haptic') !== 'false') {
        hapticVibrate([50, 30, 50]);
      }

      dispatch({ type: 'CLEAR_BILL' });
      setSplitCash('');
      setTendered('');
      setLastBill({ ...payload, shopProfile, tendered: paymentMethod === 'cash' && tendered !== '' ? Math.round((parseFloat(tendered) || 0) * 100) : null });
      setCheckoutSuccess(true);
      setIsPayOpen(false);
      const bCount = parseInt(localStorage.getItem('ledgro-billCount') || '0');
      localStorage.setItem('ledgro-billCount', (bCount + 1).toString());
    } catch (err) {
      console.error('Checkout failed:', err);
      if (localStorage.getItem('ledgro_haptic') !== 'false') {
        hapticVibrate([100, 50, 100]);
      }
      // cart is untouched, so the cashier can simply try again
      if (err?.message === 'OFFLINE') {
        toast.error('You are offline. Reconnect, then tap Checkout again. Nothing was saved.');
      } else if (err?.message === 'CLOCK') {
        toast.error(CLOCK_MSG);
      } else if (err?.message === 'TIMEOUT') {
        timedOutRef.current = true;
        toast.error('Slow connection. The bill may still go through. Check Ledger before tapping Checkout again.', { duration: 8000 });
      } else {
        pendingBillRefRef.current = null;
        timedOutRef.current = false;
        toast.error('Checkout failed. Nothing was charged. Please try again.');
      }
    } finally {
      setIsCheckingOut(false);
      isSubmittingRef.current = false;
    }
  };

  // Render the receipt ONCE as soon as the success screen shows. iOS only opens the
  // share sheet inside a tap, so the files must already exist when the user taps.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!checkoutSuccess || !lastBill) { setReceiptFiles(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!receiptRef.current) return;
      try {
        const { default: html2canvas } = await import('html2canvas-pro');
        const canvas = await html2canvas(receiptRef.current, {
          scale: 3,
          useCORS: true, backgroundColor: '#ffffff', width: RECEIPT_PX, logging: false,
        });
        const png = await canvasToBlob(canvas);
        const pdf = await canvasToPdfBlob(canvas);
        canvas.width = 0; canvas.height = 0;
        if (!cancelled) setReceiptFiles({ png, pdf });
      } catch (err) {
        console.error(err);
        if (!cancelled) setReceiptFiles({ error: true });
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [checkoutSuccess, lastBill]);

  const receiptName = () => `ledgro-receipt-${(lastBill?.billNo || 'bill').replace(/[^\w-]/g, '')}.${receiptFormat}`;

  const shareReceipt = async () => {
    const blob = receiptFiles?.[receiptFormat];
    if (!blob) { toast.error(receiptFiles?.error ? 'Could not create the receipt.' : 'Receipt still preparing…'); return; }
    // no await before this call: keeps the tap's user-activation alive on iOS
    const r = await shareFile(blob, receiptName(), `Receipt from ${shopName || 'shop'}`);
    if (r === 'unsupported') {
      await saveFile(blob, receiptName());
      toast.info('Sharing not supported here. Receipt saved instead.');
    }
  };

  const downloadReceipt = async () => {
    const blob = receiptFiles?.[receiptFormat];
    if (!blob) { toast.error(receiptFiles?.error ? 'Could not create the receipt.' : 'Receipt still preparing…'); return; }
    await saveFile(blob, receiptName(), 'Save receipt');
  };

  const handleNewBill = () => {
    setCheckoutSuccess(false);
    setLastBill(null);
    dispatch({ type: 'CLEAR_BILL' });
    navigate('.', { replace: true, state: {} });
    window.dispatchEvent(new Event('ledgro:checkout-complete'));
  };

  if (checkoutSuccess) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-start gap-4 p-4 pb-10">
        <Receipt ref={receiptRef} billData={lastBill} />

        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-sm w-full z-10">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Checkout Successful</h2>
          <p className="text-gray-500 mb-8 font-medium">₹{lastBill?.grandTotal ? (lastBill.grandTotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : 0} collected via {lastBill?.paymentMethod?.toUpperCase()}</p>

          <div className="space-y-3">
            <div className="flex bg-slate-100 p-1 rounded-xl" role="group" aria-label="Receipt format">
              {['png', 'pdf'].map((f) => (
                <button key={f} type="button" onClick={() => setReceiptFormat(f)}
                  className={`flex-1 py-2 text-sm font-black uppercase rounded-lg transition-colors ${receiptFormat === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={shareReceipt}
              disabled={!receiptFiles || receiptFiles.error}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Share2 size={20} /> {receiptFiles ? 'Share' : 'Preparing…'}
            </button>
            <button
              onClick={downloadReceipt}
              disabled={!receiptFiles || receiptFiles.error}
              className="w-full bg-white border border-slate-200 text-slate-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <Download size={20} /> {/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'Save (Files / Photos)' : 'Download'}
            </button>
            <button
              onClick={handleNewBill}
              className="w-full bg-gray-100 text-gray-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 active:bg-gray-300 transition-colors mt-4"
            >
              <PlusCircle size={20} /> Done (New Bill)
            </button>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Receipt preview</p>
          <div style={{ zoom: Math.min(1, (window.innerWidth - 32) / 384) }}>
            <Receipt billData={lastBill} preview />
          </div>
        </div>
      </div>
    );
  }

  // Under-payment helper shared by cash, UPI and split: shows the gap and offers to take what was paid as full payment (the rest becomes a discount).
  const shortUi = (paid, giveBack, backWord = 'Give back') => {
    const diff = paid - grandTotal;
    if (diff >= 0) {
      return giveBack ? <p className="rounded-xl bg-green-50 px-4 py-3 text-center text-lg font-black text-green-700 tabular-nums">{backWord} {formatCurrency(diff)}</p> : null;
    }
    return (
      <div className="space-y-2">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-600 tabular-nums">Short by {formatCurrency(-diff)}</p>
        {paid > 0 && (
          <button type="button"
            onClick={() => dispatch({ type: 'SET_GLOBAL_DISCOUNT', payload: { type: 'flat', value: globalDiscountAmt - diff } })}
            className="h-12 w-full rounded-xl bg-amber-100 text-sm font-bold text-amber-800 active:scale-95 transition-transform">
            Take {formatCurrency(paid)} as full payment (discount {formatCurrency(-diff)})
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-white flex flex-col">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-4 pb-3 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{editBill ? 'Correct & Edit Bill' : 'New Bill'}</h1>
          {items.length > 0 && !editBill && (
            <button type="button" onClick={clearBill} className="rounded-lg px-2 py-1 text-sm font-semibold text-red-500 active:bg-red-50">Clear</button>
          )}
        </div>
        <SearchSheet onAddItem={handleAddItem} onRemoveOne={handleRemoveOne} cartQty={cartQty} itemCount={items.length} />
      </header>

      {editBill && !checkoutSuccess && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 text-xs font-semibold text-orange-800 text-center">
          You are editing an existing bill. Saving will void the original.
        </div>
      )}

      <main className={`flex-1 flex flex-col ${items.length > 0 ? (paymentMethod === 'split' ? 'pb-96' : 'pb-80') : 'pb-24'}`}>
        <div className="px-4 flex-1 mt-2">
          {items.length === 0 ? (
            <div>
              <div className="flex flex-col items-center justify-center text-slate-500 mt-10 text-center">
                <p className="font-medium">No items yet</p>
                <p className="text-sm mt-1">Tap search or pick a best seller</p>
              </div>
              <QuickPicks onAddItem={handleAddItem} />
            </div>
          ) : (
            <div className="flex flex-col">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35, duration: 0.2 }}
                  >
                    <CartItem
                      item={item}
                      dispatch={dispatch}
                      onOpenDiscount={openLineDiscount}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {items.length > 0 && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
          <div className="p-4 max-w-md mx-auto">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-900">{items.length}</span> {items.length === 1 ? 'item' : 'items'}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={openGlobalDiscount}
                  className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md flex items-center gap-1"
                >
                  <Tag size={12} />
                  Bill Discount
                </button>
                <div className="text-right">
                  {globalDiscountAmt > 0 && (
                    <span className="text-xs text-gray-400 line-through block leading-none mb-0.5">
                      ₹{(subtotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  )}
                  <animated.span className="text-2xl font-bold text-gray-900 leading-none">
                    {springTotal.val.to((val) => `₹${(Math.round(val) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`)}
                  </animated.span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPayOpen(true)}
              disabled={isCheckingOut}
              className="w-full bg-blue-600 text-white font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm"
            >
              Checkout · {formatCurrency(grandTotal)}
            </button>
          </div>
        </div>
      )}

      {isPayOpen && (
        <div role="dialog" aria-modal="true" aria-label="Payment" style={{ bottom: 'var(--kb, 0px)' }} className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={() => !isCheckingOut && setIsPayOpen(false)}>
          <div className="w-full max-h-full overflow-y-auto rounded-t-[24px] bg-white p-4 pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="mx-auto max-w-md space-y-4">
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount to collect</p>
                <p className="text-4xl font-black text-slate-900 tabular-nums">{formatCurrency(grandTotal)}</p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl" role="group" aria-label="Payment method">
                {['cash', 'upi', 'split'].map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => { setPaymentMethod(method); setTendered(''); if (method !== 'split') setSplitCash(''); }}
                    className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider rounded-lg transition-all ${paymentMethod === method ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                  >
                    {method}
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500">Cash received (optional)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                    <input type="number" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value.slice(0, 9))}
                      className="w-full pl-7 pr-3 h-12 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900" />
                  </div>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {[...new Set([grandTotal, ...[100, 200, 500, 2000].map((n) => n * 100).filter((n) => n >= grandTotal)])].slice(0, 4).map((p) => (
                      <button key={p} type="button" onClick={() => setTendered(String(p / 100))} className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 active:scale-95 transition-transform">
                        {p === grandTotal ? 'Exact' : `₹${p / 100}`}
                      </button>
                    ))}
                  </div>
                  {tendered !== '' && shortUi(Math.round((parseFloat(tendered) || 0) * 100), true)}
                </div>
              )}
              {paymentMethod === 'upi' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500">UPI received (optional)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                    <input type="number" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value.slice(0, 9))}
                      className="w-full pl-7 pr-3 h-12 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTendered(String(grandTotal / 100))} className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 active:scale-95 transition-transform">Exact</button>
                  </div>
                  {tendered !== '' && shortUi(Math.round((parseFloat(tendered) || 0) * 100), true, 'Send back by UPI')}
                </div>
              )}
              {paymentMethod === 'split' && (
                <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Cash received</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                      <input type="number" inputMode="decimal" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} autoFocus
                        className="w-full pl-7 pr-3 h-12 border border-green-200 bg-green-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 font-bold text-green-700" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">UPI remaining</label>
                    <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 font-bold text-slate-500">
                      {formatCurrency(Math.max(0, grandTotal - Math.round((parseFloat(splitCash) || 0) * 100)))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {[...new Set([...[100, 200, 500, 1000, 2000].map((n) => n * 100), Math.round(grandTotal / 2)])].filter((n) => n > 0 && n < grandTotal).sort((x, y) => x - y).slice(0, 4).map((n) => (
                    <button key={n} type="button" onClick={() => setSplitCash(String(n / 100))} className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 active:scale-95 transition-transform">
                      {n === Math.round(grandTotal / 2) ? `Half ₹${n / 100}` : `₹${n / 100}`}
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-bold text-slate-500">UPI actually received (optional)</label>
                <input type="number" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value.slice(0, 9))}
                  className="w-full px-3 h-12 border border-blue-200 bg-blue-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-700" />
                {tendered !== '' && splitCash !== '' && shortUi(Math.round(((parseFloat(splitCash) || 0) + (parseFloat(tendered) || 0)) * 100), false)}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsPayOpen(false)} disabled={isCheckingOut} className="h-14 flex-1 rounded-xl bg-slate-100 font-bold text-slate-600 disabled:opacity-50">Back</button>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isCheckingOut || (paymentMethod === 'split' && (!splitCash || Math.round(parseFloat(splitCash) * 100) <= 0 || Math.round(parseFloat(splitCash) * 100) >= grandTotal))}
                  className="h-14 flex-[2] rounded-xl bg-blue-600 font-bold text-white active:bg-blue-700 disabled:opacity-50"
                >
                  {isCheckingOut ? 'Processing...' : `Confirm ${paymentMethod.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DiscountDrawer
        isOpen={isDiscountOpen}
        onClose={() => setIsDiscountOpen(false)}
        targetItem={activeDiscountItem}
        globalDiscount={state.globalDiscount}
        dispatch={dispatch}
      />

      <BottomNav />
    </div>
  );
}
