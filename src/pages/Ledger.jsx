import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, startAfter, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useInView } from 'react-intersection-observer';
import BottomNav from '../components/BottomNav';
import { RefreshCcw, FileText } from 'lucide-react';

export default function Ledger() {
  const { user, shopId } = useAuth();
  const [bills, setBills] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [reversingId, setReversingId] = useState(null);

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900">Ledger History</h1>
      </header>

      <main className="flex-1 pb-24 p-4">
        {bills.length === 0 && !loading ? (
          <div className="text-center text-gray-500 mt-20">No bills found.</div>
        ) : (
          <div className="space-y-4">
            {bills.map(bill => {
              const isReversal = bill.type === 'reversal';
              const date = bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleString() : 'Pending sync...';

              return (
                <div key={bill.id} className={`p-4 rounded-xl shadow-sm border ${isReversal ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {isReversal ? <RefreshCcw size={18} className="text-red-500" /> : <FileText size={18} className="text-gray-400" />}
                      <span className="text-sm font-medium text-gray-500">{date}</span>
                    </div>
                    <span className={`font-bold text-lg ${isReversal ? 'text-red-600' : 'text-gray-900'}`}>
                      ₹{bill.grandTotal}
                    </span>
                  </div>

                  {isReversal ? (
                    <p className="text-sm text-red-600">Reversal for bill ending in ...{bill.originalBillId.slice(-4)}</p>
                  ) : (
                    <div className="flex justify-between items-end mt-4">
                      <div className="text-sm text-gray-500">
                        {bill.items?.length || 0} items • {bill.paymentMethod?.toUpperCase()}
                      </div>
                      <button
                        onClick={() => handleVoidBill(bill)}
                        disabled={reversingId === bill.id}
                        className="text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg active:bg-red-100 disabled:opacity-50"
                      >
                        {reversingId === bill.id ? 'Voiding...' : 'Void Bill'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Infinite Scroll trigger element */}
        <div ref={ref} className="py-4 flex justify-center">
          {loading && <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
