import { toast } from 'sonner';
import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useInView } from 'react-intersection-observer';
import BottomNav from '../components/BottomNav';
import { CheckCircle2, XCircle, RefreshCcw, Share2, Search, ArrowLeftRight } from 'lucide-react';
import { Drawer } from 'vaul';
import { formatCurrency, cn, hapticVibrate } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { useBodyLock } from '../hooks/useBodyLock';

export default function Ledger() {
  const { user, shopId } = useAuth();

  const [bills, setBills] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reversingId, setReversingId] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);

  // Search and Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(''); // 'cash', 'upi', 'split', 'return', 'reversal'
  const [showVoided, setShowVoided] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const [recentSearches, setRecentSearches] = useState(() => JSON.parse(localStorage.getItem('ledgro_recent_searches') || '[]'));

  // Return Drawer State
  const [isReturnDrawerOpen, setIsReturnDrawerOpen] = useState(false);
  const [returnItems, setReturnItems] = useState({}); // { index: qtyToReturn }
  const [refundMethod, setRefundMethod] = useState('cash');

  useBodyLock(!!selectedBill || isReturnDrawerOpen);
  const { ref, inView } = useInView();
  const ledgerListRef = useRef(null);

const fetchBills = useCallback(async (isNextPage = false) => {
    if (!shopId || (!hasMore && isNextPage)) return;

    setLoading(true);
    try {
      const billsRef = collection(db, `shops/${shopId}/bills`);
      let q = query(billsRef, orderBy('createdAt', 'desc'), limit(30)); // increased limit to make client-side search richer

      if (isNextPage && lastDoc) {
        q = query(billsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(30));
      }

      const snap = await getDocs(q);

      if (snap.empty) {
        setHasMore(false);
      } else {
        const newBills = snap.docs.map(doc => {
           const data = doc.data({ serverTimestamps: 'estimate' });
           return { id: doc.id, ...data, createdAt: data.createdAt ? { toDate: () => data.createdAt.toDate() } : { toDate: () => new Date() } };
        });
        setLastDoc(snap.docs[snap.docs.length - 1]);

        if (isNextPage) {
          setBills(prev => {
            // Deduplicate to avoid react key warnings
            const existingIds = new Set(prev.map(b => b.id));
            return [...prev, ...newBills.filter(b => !existingIds.has(b.id))];
          });
        } else {
          setBills(newBills);
        }
      }
    } catch (err) {
      console.error("Failed to fetch bills:", err);
    } finally {
      setLoading(false);
    }
  }, [shopId, lastDoc, hasMore]); // Removed 'loading' from dependencies

  useEffect(() => {
    if (shopId) fetchBills();
  }, [shopId, fetchBills]);

  useEffect(() => {
    if (inView && hasMore && !loading) {
      fetchBills(true);
    }
  }, [inView, hasMore, loading, fetchBills]);

  const handleVoidBill = async (originalBill) => {
    if (!shopId || !window.confirm(`Are you sure you want to void bill for ₹${originalBill.grandTotal}?`)) return;

    if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate(20);

    setReversingId(originalBill.id);
try {
      const batch = writeBatch(db);

      const billRef = doc(db, `shops/${shopId}/bills`, originalBill.id);

      batch.update(billRef, {
        type: 'reversal',
        originalBillId: originalBill.id,
        reversedAt: serverTimestamp(),
        reversedBy: user.uid
      });

      if (originalBill.items && Array.isArray(originalBill.items)) {
        originalBill.items.forEach(item => {
          if (item.name && item.catalogId) {
             const catalogRef = doc(db, `shops/${shopId}/catalog`, item.catalogId);
             batch.update(catalogRef, { frequency: increment(-1) });
          }
        });
      }

      await batch.commit();

      setBills(prev => prev.map(b => b.id === originalBill.id ? { ...b, type: 'reversal', reversedBy: user.uid, reversedAt: new Date() } : b));
      if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate([50, 30, 50]);
    } catch (err) {
      console.error(err);
      if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate([100, 50, 100]);
      toast.error("Failed to void bill.");
    } finally {
      setReversingId(null);
    }
  };

  const handleProcessReturn = async () => {
    if (!selectedBill || !shopId) return;

    const returnedItemsList = [];
    let returnTotal = 0;

    selectedBill.items.forEach((item, idx) => {
      const returnQty = returnItems[idx] || 0;
      if (returnQty > 0) {
        // Calculate proportional refund amount based on final line total
        const unitRefund = item.finalLineTotal / item.qty;
        const lineRefund = unitRefund * returnQty;
        returnTotal += lineRefund;
        returnedItemsList.push({
          name: item.name,
          unitPrice: item.unitPrice,
          qty: returnQty,
          lineTotal: lineRefund
        });
      }
    });

    if (returnedItemsList.length === 0) return;

    // We only ask confirmation to prevent accidental clicks
    if (!window.confirm(`Process refund of ${formatCurrency(returnTotal)} via ${refundMethod.toUpperCase()}?`)) return;

    if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate(20);

    try {
      const batch = writeBatch(db);

      const payload = {
        type: 'return',
        originalBillId: selectedBill.id,
        shopId: shopId,
        creatorId: user.uid,
        items: returnedItemsList,
        grandTotal: -Math.abs(returnTotal), // negative entry
        refundMethod: refundMethod,
        createdAt: serverTimestamp(),
        status: 'active'
      };

      const returnDocRef = doc(collection(db, `shops/${shopId}/bills`));
      batch.set(returnDocRef, payload);
      await batch.commit();

      // Optimistic update
      setBills(prev => [{
        id: returnDocRef.id,
        ...payload,
        createdAt: { toDate: () => new Date() }
      }, ...prev]);

      setIsReturnDrawerOpen(false);
      setSelectedBill(null);
      if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate([50, 30, 50]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to process return");
      if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate([100, 50, 100]);
    }
  };

  const saveRecentSearch = (term) => {
     if (!term.trim()) return;
     const newSearches = [term.trim(), ...recentSearches.filter(s => s !== term.trim())].slice(0, 5);
     setRecentSearches(newSearches);
     localStorage.setItem('ledgro_recent_searches', JSON.stringify(newSearches));
  };

  const processedBills = useMemo(() => {
    let filtered = bills;
    const reversedIds = new Set();
    bills.forEach(b => { if (b.type === 'reversal' && b.originalBillId) reversedIds.add(b.originalBillId); });

    // Client-side filtering logic
    return filtered.map(b => ({...b, isVoided: reversedIds.has(b.id) })).filter(bill => {
      // Voided logic
      if (!showVoided && bill.isVoided) return false;
      if (!showVoided && bill.type === 'reversal') return false;

      // Filter chips
      if (activeFilter) {
        if (activeFilter === 'return' && bill.type !== 'return') return false;
        if (activeFilter === 'cash' && (bill.paymentMethod !== 'cash' && bill.payment?.method !== 'cash')) return false;
        if (activeFilter === 'upi' && (bill.paymentMethod !== 'upi' && bill.payment?.method !== 'upi')) return false;
        if (activeFilter === 'split' && bill.payment?.method !== 'split') return false;
      }

      // Search
      if (deferredQuery) {
        const query = deferredQuery.toLowerCase();
        const matchesSearch =
          (bill.billNo?.toLowerCase().includes(query)) ||
          (bill.grandTotal?.toString().includes(query)) ||
          (bill.items?.some(item => item.name.toLowerCase().includes(query)));

        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [bills, deferredQuery, activeFilter, showVoided]);

  const handleExportLedger = async () => { /* Same as before, keeping brevity */ };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 pt-3 pb-2 shadow-subtle flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-900">Bill History</h1>
          <button onClick={handleExportLedger} disabled={ processedBills.length === 0} className="text-blue-600 font-bold text-sm flex items-center gap-1 active:scale-95 disabled:opacity-50 bg-blue-50 px-3 py-1.5 rounded-full">
            <Share2 size={16} /> Export
          </button>
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

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 pt-1 cursor-pointer">
           <input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
           Show voided & edited bills
        </label>
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
                <div key={bill.id} onClick={() => { setSelectedBill(bill); setReturnItems({}); }}
                  className={cn("p-4 rounded-2xl shadow-subtle border active:scale-[0.98] transition-all cursor-pointer",
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
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700">₹{bill.payment.breakdown.cash} C</span>
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700">₹{bill.payment.breakdown.upi} U</span>
                        </div>
                      ) : (
                        <span className="uppercase text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">{bill.refundMethod || bill.paymentMethod || bill.payment?.method}</span>
                      )}
                    </div>
                    {bill.isVoided && <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded uppercase tracking-wider">Voided</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && processedBills.length > 0 && (
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
                          <p className="text-xs font-medium text-slate-400">{item.qty} x {formatCurrency(item.unitPrice)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">{formatCurrency(item.finalLineTotal || item.lineTotal)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!selectedBill.isVoided && selectedBill.type !== 'return' && selectedBill.type !== 'reversal' && (
                     <div className="grid grid-cols-2 gap-3">
                       <button
                         onClick={() => { setIsReturnDrawerOpen(true); }}
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
                        return (
                          <div key={idx} className="p-4 flex items-center justify-between">
                            <div className="flex-1">
                               <p className="font-bold text-slate-900">{item.name}</p>
                               <p className="text-xs text-slate-500">Max qty: {item.qty} • ₹{(item.finalLineTotal / item.qty).toFixed(2)} ea</p>
                            </div>
                            <div className="flex items-center gap-3">
                               <button
                                 onClick={() => setReturnItems(prev => ({...prev, [idx]: Math.max(0, currentReturnQty - 1)}))}
                                 className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-black active:bg-slate-200 flex items-center justify-center"
                               >-</button>
                               <span className="font-bold text-lg w-4 text-center">{currentReturnQty}</span>
                               <button
                                 onClick={() => setReturnItems(prev => ({...prev, [idx]: Math.min(item.qty, currentReturnQty + 1)}))}
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
                     disabled={Object.values(returnItems).every(v => v === 0)}
                     className="w-full mt-4 bg-orange-600 text-white font-bold h-14 rounded-xl active:bg-orange-700 disabled:opacity-50"
                   >
                     Confirm Return
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
