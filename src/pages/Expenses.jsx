import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc, doc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Drawer } from 'vaul';
import BottomNav from '../components/BottomNav';
import { motion } from 'framer-motion';
import { Zap, Plus, Home, Users, Package, Trash2, ArrowRight } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { useBodyLock } from '../hooks/useBodyLock';
import { hapticVibrate } from '../lib/utils';

const CATEGORIES = [
  { id: 'electricity', label: 'Electricity', icon: Zap },
  { id: 'rent', label: 'Rent', icon: Home },
  { id: 'wages', label: 'Wages', icon: Users },
  { id: 'supplies', label: 'Supplies', icon: Package },
];

export default function Expenses() {
  const { user, shopId, shopAdminId } = useAuth();
  const isAdmin = user?.uid === shopAdminId;
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Drawer state
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');

  useBodyLock(isOpen);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [paidVia, setPaidVia] = useState('cash'); // 'cash' | 'upi'
  const [fetchError, setFetchError] = useState(false);

  const fetchExpenses = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setFetchError(false);
    try {
      // Optimize to only fetch recent expenses to prevent unbounded scans
      const q = query(collection(db, `shops/${shopId}/expenses`), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) })));
    } catch (err) {
      console.error("Failed to fetch expenses", err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = Math.round(parseFloat(amount) * 100);
    if (!shopId || !parsedAmount || parsedAmount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }

    if (!navigator.onLine) {
      toast.error('You are offline. Reconnect and try again. Nothing was saved.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        amount: parsedAmount,
        description: description.trim().slice(0, 200),
        category: category,
        paidVia: paidVia,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
        clientCreatedAt: new Date().toISOString()
      };

      const expensesRef = collection(db, `shops/${shopId}/expenses`);
      const newDocRef = await addDoc(expensesRef, payload);

      // Optimistic addition
      setExpenses(prev => [{ id: newDocRef.id, ...payload, createdAt: { toDate: () => new Date() } }, ...prev]);

      // Reset form
      setPaidVia('cash');
      setAmount('');
      setDescription('');
      setCategory(CATEGORIES[0].id);
      setIsOpen(false);
      hapticVibrate(10);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    // 1. Optimistic UI update (instantly remove from screen)
    const previousExpenses = [...expenses];
    setExpenses(prev => prev.filter(e => e.id !== id));

    try {
      // 2. Asynchronous backend deletion
      await deleteDoc(doc(db, `shops/${shopId}/expenses`, id));
    } catch (err) {
      console.error("Failed to delete expense", err);
      // Rollback on failure
      setExpenses(previousExpenses);
      toast.error("Failed to delete expense. Reverted.");
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-gray-50 flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center shadow-subtle">
        <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
        <button
          aria-label="New Expense"
          onClick={() => setIsOpen(true)}
          className="bg-gray-900 hover:bg-gray-800 active:scale-95 transition-all text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm"
        >
          <Plus size={16} /> New
        </button>
      </header>

      <main className="p-4 flex-1 pb-24">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center h-full mt-10">
            <p className="text-red-500 font-medium mb-4">Failed to load expenses.</p>
            <button onClick={() => fetchExpenses()} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg font-bold">Retry</button>
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full mt-10">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
              <Plus size={32} />
            </div>
            <p className="text-gray-500 font-medium">No expenses recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3 relative">
            <div className="absolute left-[39px] top-6 bottom-6 w-[2px] bg-slate-100 -z-10 rounded-full" />

            {expenses.map(expense => {
              const cat = CATEGORIES.find(c => c.id === expense.category);
              const Icon = cat ? cat.icon : Package;
              const date = expense.createdAt?.toDate ? expense.createdAt.toDate().toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Just now';

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={expense.id}
                  className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4 relative overflow-hidden group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm shrink-0">
                    <Icon size={20} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 truncate pr-2">{expense.description || cat?.label || 'Other'}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                       <p className="text-xs font-semibold text-slate-400">{date}</p>
                       <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{expense.paidVia || 'cash'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-900 text-lg">₹{(expense.amount / 100).toLocaleString('en-IN')}</p>
                  </div>

                  {/* Swipe Actions Overlay (Simplified for Desktop/PWA ease) */}
                  {isAdmin && (
                    <button
                         type="button"
                         aria-label="Delete Expense"
                         className="absolute inset-y-0 right-0 bg-red-50 text-red-600 flex items-center justify-center w-0 overflow-hidden group-active:w-20 lg:group-hover:w-20 transition-all duration-300 ease-out z-10 border-l border-red-100 shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.05)] cursor-pointer"
                         onClick={() => handleDeleteExpense(expense.id)}
                    >
                       <Trash2 size={20} strokeWidth={2.5} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      <Drawer.Root open={isOpen} onOpenChange={(open) => {
         setIsOpen(open);
         if (!open) {
            setAmount('');
            setDescription('');
            setCategory(CATEGORIES[0].id);
         }
      }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-white flex flex-col rounded-t-[10px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-50 focus:outline-none">
            <div className="p-4 bg-white rounded-t-[10px] flex-1 pb-safe">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-300 mb-6" />
              <div className="max-w-md mx-auto">
                <Drawer.Title className="font-bold text-gray-900 mb-6 text-xl">
                  Add Expense
                </Drawer.Title>

              <form onSubmit={handleAddExpense} className="space-y-6">
                <div>
                  <label htmlFor="expense-amount" className="block text-sm font-semibold text-slate-700 mb-1">Amount *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-gray-500 font-medium text-lg">₹</span>
                    </div>
                    <input
                      id="expense-amount"
                      type="number"
                      inputMode="decimal"
                      required
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.slice(0, 10))}
                      className="block w-full pl-8 pr-4 py-4 border-2 border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-0 text-xl font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Paid Via</label>
                   <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button type="button" onClick={() => setPaidVia('cash')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${paidVia === 'cash' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Drawer Cash</button>
                      <button type="button" onClick={() => setPaidVia('upi')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${paidVia === 'upi' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Bank / UPI</button>
                   </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                  <div className="grid grid-cols-4 gap-2">
                    {CATEGORIES.map(cat => {
                      const Icon = cat.icon;
                      const isSelected = category === cat.id;
                      return (
                        <button
                          type="button"
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}
                        >
                          <Icon size={24} className="mb-1" />
                          <span className="text-xs font-medium">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="expense-desc" className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                  <input
                    id="expense-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={200}
                    className="block w-full px-4 py-4 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Note or description (optional)"
                  />
                </div>

                  <button
                    type="submit"
                    disabled={submitting || !amount}
                    className="w-full bg-indigo-600 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 active:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Saving...' : 'Save Expense'} <ArrowRight size={20} />
                  </button>
                </form>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
