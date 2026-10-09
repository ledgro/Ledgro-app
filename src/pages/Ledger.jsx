import { toast } from 'sonner';
import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, getDoc, orderBy, limit, startAfter, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useInView } from 'react-intersection-observer';
import BottomNav from '../components/BottomNav';
import { CheckCircle2, XCircle, RefreshCcw, Search, ArrowLeftRight } from 'lucide-react';
import { Drawer } from 'vaul';
import { formatCurrency, cn, hapticVibrate } from '../lib/utils';
import { useBodyLock } from '../hooks/useBodyLock';
import { fetchAllPaged } from '../lib/firestoreUtils';
import { writeStats, voidEntries } from '../lib/dayStats';
import { billDelta, bizDayKey } from '../lib/statsMath';
import { buildReport, rs } from '../lib/reportExport';
import { saveFile } from '../lib/shareFile';
import ExportMenu from '../components/ExportMenu';

const PAGE = 30;

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
  const { user, shopId } = useAuth();

  const [bills, setBills] = useState([]);
  const lastDoc = useRef(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [reversingId, setReversingId] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);
  const [processingReturn, setProcessingReturn] = useState(false);

  // Search and Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(''); // 'cash', 'upi', 'split', 'return'
  const [showVoided, setShowVoided] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);

  // Return Drawer State
  const [isReturnDrawerOpen, setIsReturnDrawerOpen] = useState(false);
  const [returnItems, setReturnItems] = useState({}); // { index: qtyToReturn }
  const [alreadyReturned, setAlreadyReturned] = useState({}); // { index: qty returned earlier }
  const [refundMethod, setRefundMethod] = useState('cash');

  useBodyLock(!!selectedBill || isReturnDrawerOpen);
  const { ref, inView } = useInView();
  const ledgerListRef = useRef(null);

  const fetchBills = useCallback(async (isNextPage = false) => {
    if (!shopId || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    try {
      const billsRef = collection(db, `shops/${shopId}/bills`);
      const q = isNextPage && lastDoc.current
        ? query(billsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc.current), limit(PAGE))
        : query(billsRef, orderBy('createdAt', 'desc'), limit(PAGE));

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
  }, [shopId]);

  useEffect(() => {
    if (shopId) {
      lastDoc.current = null;
      setHasMore(true);
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
      if (Object.keys(updates).length) batch.update(res.value.ref, updates);
    });
  };

  const handleVoidBill = async (originalBill) => {
    if (!shopId || !user) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!window.confirm('Are you sure you want to void this bill?')) return;
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
  const openReturnDrawer = async () => {
    if (!selectedBill) return;
    setReturnItems({});
    setAlreadyReturned({});
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

  const handleProcessReturn = async () => {
    if (!selectedBill || !shopId || !user || processingReturn) return;

    const returnedItemsList = [];
    let returnTotal = 0;

    (selectedBill.items || []).forEach((item, idx) => {
      const maxQty = Math.max(0, (Number(item.qty) || 0) - (alreadyReturned[idx] || 0));
      const returnQty = Math.min(returnItems[idx] || 0, maxQty);
      if (returnQty > 0) {
        const lineRefund = Math.round(unitRefundOf(item) * returnQty);
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
    if (!window.confirm(`Process refund of ${formatCurrency(returnTotal)} via ${refundMethod.toUpperCase()}?`)) return;
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
        billNo: `R-${selectedBill.billNo || selectedBill.id.substring(0, 6)}`,
        clientCreatedAt: Date.now(),
        createdAt: serverTimestamp(),
      };

      const returnDocRef = doc(collection(db, `shops/${shopId}/bills`));
      batch.set(returnDocRef, payload);

      // Returned goods go back on the shelf (tracked items only).
      await addCatalogAdjustments(batch, returnedItemsList, { sign: 1 });
      writeStats(batch, shopId, [{ key: bizDayKey(new Date()), delta: billDelta(payload) }]);
      await batch.commit();

      setBills((prev) => [{
        id: returnDocRef.id,
        ...payload,
        createdAt: { toDate: () => new Date() },
      }, ...prev]);

      setIsReturnDrawerOpen(false);
      setSelectedBill(null);
      if (hapticOn()) hapticVibrate([50, 30, 50]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to process return');
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

  // Exports the WHOLE ledger (paged) as PDF or PNG, not just what is scrolled in.
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
        title: 'Ledgro - Bill History',
        subtitle: `Generated ${new Date().toLocaleString()} • ${rows.length} bills`,
        summary: [`Net total (sales minus returns, voids excluded): ${rs(total)}`],
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
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 pt-3 pb-2 shadow-subtle flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-900">Bill History</h1>
          <ExportMenu label="Export" onPick={handleExportLedger} className="text-blue-600 font-bold text-sm flex items-center gap-1 active:scale-95 disabled:opacity-50 bg-blue-50 px-3 py-1.5 rounded-full" />
        </div>

        {/* Search Bar */}
        <div className="relative">
           <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
           <input
             type="text"
             value={searchQuery}
             onChange={e => setSearchQuery(e.target.value)}
             onBlur={() => saveRecentSearch(searchQuery)}
             placeholder="Search bills, items, amounts..."
             className="w-full bg-slate-100 border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
           />
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {['cash', 'upi', 'split', 'return'].map(f => (
            <button
              type="button"
              key={f}
              onClick={() => setActiveFilter(activeFilter === f ? '' : f)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors border",
                activeFilter === f ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center pt-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer">
             <input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
             Show voided & edited bills
          </label>
          <span className="text-[10px] text-slate-400">Filters apply to loaded bills only</span>
        </div>
      </header>

      <main className="flex-1 p-4">
        {/* Recent Searches */}
        {!searchQuery && recentSearches.length > 0 && (
           <div className="mb-4 flex flex-wrap gap-2">
             <span className="text-xs font-bold text-slate-400 uppercase w-full">Recent Searches</span>
             {recentSearches.map(s => (
               <button key={s} onClick={() => setSearchQuery(s)} className="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-semibold rounded-full active:bg-slate-300">
                 {s}
               </button>
             ))}
           </div>
        )}

        {processedBills.length === 0 && !loading ? (
          <div className="text-center text-slate-500 mt-20 font-medium">No results found.</div>
        ) : (
          <div className="space-y-4" ref={ledgerListRef}>
            {processedBills.map(bill => {
              const date = bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Pending sync...';
              const isReturn = bill.type === 'return';

              return (
                <button type="button" key={bill.id} onClick={() => { setSelectedBill(bill); setReturnItems({}); }}
                  className={cn("w-full text-left p-4 rounded-2xl shadow-subtle border active:scale-[0.98] transition-all cursor-pointer block",
                    bill.isVoided ? "bg-slate-50 border-slate-200 opacity-60" : "bg-white border-slate-100"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {bill.isVoided ? <XCircle size={16} className="text-slate-400" /> : isReturn ? <ArrowLeftRight size={16} className="text-orange-500" /> : <CheckCircle2 size={16} className="text-green-500" />}
                      <span className="text-xs font-semibold text-slate-500">{date}</span>
                      {isReturn && <span className="bg-orange-100 text-orange-700 text-[10px] font-black uppercase px-2 py-0.5 rounded">Return</span>}
                    </div>
                    <span className={cn("font-black text-lg", bill.isVoided ? "text-slate-500 line-through" : isReturn ? "text-red-600" : "text-slate-900")}>
                      {formatCurrency(bill.grandTotal)}
                    </span>
                  </div>

                  <div className="flex justify-between items-end mt-3">
                    <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
                      <span>{bill.items?.length || 0} items</span>
                      <span>•</span>
                      {bill.payment?.method === 'split' ? (
                        <div className="flex items-center text-[10px] font-bold bg-slate-100 rounded overflow-hidden">
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700">₹{(bill.payment.breakdown.cash / 100).toFixed(0)} C</span>
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700">₹{(bill.payment.breakdown.upi / 100).toFixed(0)} U</span>
                        </div>
                      ) : (
                        <span className="uppercase text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">{bill.refundMethod || bill.paymentMethod || bill.payment?.method}</span>
                      )}
                    </div>
                    {bill.isVoided && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded uppercase tracking-wider">Voided</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {hasMore && bills.length > 0 && (
           <div ref={ref} className="py-8 text-center text-slate-400 font-semibold text-sm">
             {loading ? 'Loading more...' : 'Scroll for more'}
           </div>
        )}
      </main>

      {/* Bill Preview Drawer */}
      <Drawer.Root open={!!selectedBill && !isReturnDrawerOpen} onOpenChange={(open) => !open && setSelectedBill(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-slate-50 flex flex-col rounded-t-[24px] mt-24 h-[85vh] fixed bottom-0 left-0 right-0 z-50 focus:outline-none overflow-hidden">
            <div className="p-4 bg-slate-50 flex-1 overflow-y-auto pb-safe">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />

              {selectedBill && (
                <div className="max-w-md mx-auto space-y-6">
                  <div className="text-center">
                    <h2 className={cn("text-3xl font-black mb-1", selectedBill.isVoided ? "text-slate-500 line-through" : selectedBill.type === 'return' ? "text-red-600" : "text-slate-900")}>
                      {formatCurrency(selectedBill.grandTotal)}
                    </h2>
                    <p className="text-slate-500 font-medium text-sm">{selectedBill.createdAt?.toDate ? selectedBill.createdAt.toDate().toLocaleString() : 'Pending'}</p>
                    <p className="text-xs text-slate-400 font-mono mt-1">#{selectedBill.billNo || selectedBill.id.substring(0,8)}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 divide-y divide-slate-50">
                    <h3 className="font-bold text-slate-400 uppercase tracking-wider text-xs mb-3 pb-2">Itemized List</h3>
                    {selectedBill.items?.map((item, idx) => (
                      <div key={idx} className="py-2.5 flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs font-medium text-slate-400">{item.qty} x {formatCurrency(item.unitPriceAtSale || item.unitPrice)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">{formatCurrency(item.finalLineTotal ?? item.lineTotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!selectedBill.isVoided && selectedBill.type !== 'return' && selectedBill.type !== 'reversal' && (
                     <div className="grid grid-cols-2 gap-3">
                       <button
                         onClick={openReturnDrawer}
                         className="w-full bg-orange-50 text-orange-600 font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-orange-100 transition-colors shadow-sm"
                       >
                         <ArrowLeftRight size={20} /> Return Items
                       </button>
                       <button
                         onClick={() => { handleVoidBill(selectedBill); setSelectedBill(null); }}
                         disabled={reversingId === selectedBill.id}
                         className="w-full bg-red-50 text-red-600 font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-red-100 transition-colors shadow-sm disabled:opacity-50"
                       >
                         <RefreshCcw size={20} /> Void Full Bill
                       </button>
                     </div>
                  )}
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Process Return Drawer */}
      <Drawer.Root open={isReturnDrawerOpen} onOpenChange={(open) => { setIsReturnDrawerOpen(open); if(!open) setSelectedBill(null); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content className="bg-slate-50 flex flex-col rounded-t-[24px] mt-24 h-[90vh] fixed bottom-0 left-0 right-0 z-[60] focus:outline-none overflow-hidden">
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
                               <p className="text-xs text-slate-500">Max qty: {maxQty}{alreadyReturned[idx] ? ` (${alreadyReturned[idx]} already returned)` : ''} • {formatCurrency(Math.round(unitRefundOf(item)))} ea</p>
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
                     <p className="text-sm font-bold text-slate-700 mb-2">Refund Method</p>
                     <div className="flex bg-slate-200 p-1 rounded-xl">
                       <button onClick={() => setRefundMethod('cash')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", refundMethod==='cash' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>Cash</button>
                       <button onClick={() => setRefundMethod('upi')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-colors", refundMethod==='upi' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>UPI</button>
                     </div>
                   </div>

                   <button
                     onClick={handleProcessReturn}
                     disabled={processingReturn || Object.values(returnItems).every(v => !v)}
                     className="w-full mt-4 bg-orange-600 text-white font-bold h-14 rounded-xl active:bg-orange-700 disabled:opacity-50"
                   >
                     {processingReturn ? 'Processing…' : 'Confirm Return'}
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
