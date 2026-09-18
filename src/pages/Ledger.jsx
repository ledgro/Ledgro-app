import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, startAfter, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useInView } from 'react-intersection-observer';
import BottomNav from '../components/BottomNav';
import { FileText, CheckCircle2, XCircle, RefreshCcw } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { Drawer } from 'vaul';
import { formatCurrency, cn } from '../lib/utils';
import { useMemo } from 'react';

export default function Ledger() {
  const { user, shopId } = useAuth();
  const [bills, setBills] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reversingId, setReversingId] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);

  const { ref, inView } = useInView();

  const fetchBills = useCallback(async (isNextPage = false) => {
    if (!shopId || loading || (!hasMore && isNextPage)) return;

    setLoading(true);
    try {
      const billsRef = collection(db, `shops/${shopId}/bills`);
      let q = query(billsRef, orderBy('createdAt', 'desc'), limit(20));

      if (isNextPage && lastDoc) {
        q = query(billsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(20));
      }

      const snap = await getDocs(q);

      if (snap.empty) {
        setHasMore(false);
      } else {
        const newBills = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLastDoc(snap.docs[snap.docs.length - 1]);

        if (isNextPage) {
          setBills(prev => [...prev, ...newBills]);
        } else {
          setBills(newBills);
        }
      }
    } catch (err) {
      console.error("Failed to fetch bills:", err);
    } finally {
      setLoading(false);
    }
  }, [shopId, lastDoc, loading, hasMore]);

  useEffect(() => {
    // Initial fetch
    if (shopId && bills.length === 0) {
      fetchBills();
    }
  }, [shopId, fetchBills, bills.length]);

  useEffect(() => {
    // Infinite scroll trigger
    if (inView && hasMore && !loading) {
      fetchBills(true);
    }
  }, [inView, hasMore, loading, fetchBills]);

  const handleVoidBill = async (originalBill) => {
    if (!shopId || !window.confirm(`Are you sure you want to void bill for ₹${originalBill.grandTotal}?`)) return;

    setReversingId(originalBill.id);
    try {
      const payload = {
        type: 'reversal',
        originalBillId: originalBill.id,
        creatorId: user.uid,
        grandTotal: -Math.abs(originalBill.grandTotal), // Ensure it's negative
        createdAt: serverTimestamp() // Must use server time for strict accounting
      };

      const reversalDocRef = await addDoc(collection(db, `shops/${shopId}/bills`), payload);

      // Optimistic update: inject the reversal at the top of the timeline
      const optimisticReversal = {
        id: reversalDocRef.id,
        ...payload,
        createdAt: { toDate: () => new Date() }, // Mock timestamp for immediate UI
      };

      setBills(prev => [optimisticReversal, ...prev]);
    } catch (err) {
      console.error("Failed to void bill:", err);
      alert("Failed to void bill.");
    } finally {
      setReversingId(null);
    }
  };

  // Merge reversals into original bills
  const mergedBills = useMemo(() => {
    const activeBills = [];
    const reversedIds = new Set();

    // Find all reversals first
    bills.forEach(b => {
      if (b.type === 'reversal' && b.originalBillId) {
        reversedIds.add(b.originalBillId);
      }
    });

    // Filter active bills and mark them if voided
    bills.forEach(b => {
      if (b.type !== 'reversal') {
        activeBills.push({
          ...b,
          isVoided: reversedIds.has(b.id)
        });
      }
    });

    return activeBills;
  }, [bills]);

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 shadow-subtle">
        <h1 className="text-xl font-bold text-slate-900">Ledger History</h1>
      </header>

      <main className="flex-1 pb-24 p-4">
        {mergedBills.length === 0 && !loading ? (
          <div className="text-center text-slate-500 mt-20 font-medium">No bills found.</div>
        ) : (
          <div className="space-y-4">
            {mergedBills.map(bill => {
              const date = bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleString() : 'Pending sync...';

              return (
                <div
                  key={bill.id}
                  onClick={() => setSelectedBill(bill)}
                  className={cn(
                    "p-4 rounded-2xl shadow-subtle border active:scale-[0.98] transition-all cursor-pointer",
                    bill.isVoided ? "bg-red-50 border-red-100 opacity-75" : "bg-white border-slate-100"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {bill.isVoided ? <XCircle size={18} className="text-red-500" /> : <CheckCircle2 size={18} className="text-green-500" />}
                      <span className="text-sm font-semibold text-slate-500">{date}</span>
                    </div>
                    <span className={cn("font-black text-xl", bill.isVoided ? "text-red-500 line-through" : "text-slate-900")}>
                      {formatCurrency(bill.grandTotal)}
                    </span>
                  </div>

                  <div className="flex justify-between items-end mt-4">
                    <div className="text-sm font-medium text-slate-500">
                      {bill.items?.length || 0} items • {bill.paymentMethod?.toUpperCase()}
                    </div>
                    {bill.isVoided && (
                      <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-md uppercase tracking-wider">Voided</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Infinite Scroll trigger element */}
        {mergedBills.length > 0 && hasMore && (
          <div ref={ref} className="py-4 flex flex-col gap-4">
            {loading && [1, 2, 3].map(i => (
              <div key={i} className="p-4 rounded-xl border border-gray-100 bg-white shadow-sm space-y-4">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <div className="flex justify-between items-end">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bill Preview Drawer */}
      <Drawer.Root open={!!selectedBill} onOpenChange={(open) => !open && setSelectedBill(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-slate-50 flex flex-col rounded-t-[24px] mt-24 h-[85vh] fixed bottom-0 left-0 right-0 z-50 focus:outline-none overflow-hidden">
            <div className="p-4 bg-slate-50 flex-1 overflow-y-auto pb-safe">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />

              {selectedBill && (
                <div className="max-w-md mx-auto space-y-6">
                  <div className="text-center">
                    <h2 className={cn("text-3xl font-black mb-1", selectedBill.isVoided ? "text-red-500 line-through" : "text-slate-900")}>
                      {formatCurrency(selectedBill.grandTotal)}
                    </h2>
                    <p className="text-slate-500 font-medium">{selectedBill.createdAt?.toDate ? selectedBill.createdAt.toDate().toLocaleString() : 'Pending'}</p>
                    <div className="mt-3 inline-flex items-center justify-center gap-1.5 bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                      {selectedBill.paymentMethod}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 divide-y divide-slate-50">
                    <h3 className="font-bold text-slate-400 uppercase tracking-wider text-xs mb-3 pb-2">Itemized List</h3>
                    {selectedBill.items?.map((item, idx) => (
                      <div key={idx} className="py-3 flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs font-medium text-slate-400">{item.qty} x {formatCurrency(item.unitPrice)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">{formatCurrency(item.finalLineTotal)}</p>
                          {item.lineDiscount?.value > 0 && <p className="text-xs text-red-500 font-medium">Disc: {item.lineDiscount.value}{item.lineDiscount.type === 'percent' ? '%' : ' flat'}</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-2 text-sm font-medium">
                     <div className="flex justify-between text-slate-500">
                       <span>Subtotal</span>
                       <span>{formatCurrency(selectedBill.subtotal)}</span>
                     </div>
                     {selectedBill.globalDiscountAmt > 0 && (
                       <div className="flex justify-between text-red-500">
                         <span>Global Discount</span>
                         <span>-{formatCurrency(selectedBill.globalDiscountAmt)}</span>
                       </div>
                     )}
                     <div className="flex justify-between text-slate-900 font-bold pt-2 border-t border-slate-100 text-lg">
                       <span>Grand Total</span>
                       <span>{formatCurrency(selectedBill.grandTotal)}</span>
                     </div>
                  </div>

                  {!selectedBill.isVoided && (
                     <button
                       onClick={() => {
                         handleVoidBill(selectedBill);
                         setSelectedBill(null);
                       }}
                       disabled={reversingId === selectedBill.id}
                       className="w-full bg-red-50 text-red-600 font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-red-100 transition-colors shadow-sm disabled:opacity-50"
                     >
                       <RefreshCcw size={20} /> {reversingId === selectedBill.id ? 'Voiding...' : 'Void & Refund Bill'}
                     </button>
                  )}
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
