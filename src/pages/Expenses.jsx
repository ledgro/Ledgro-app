import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Drawer } from 'vaul';
import BottomNav from '../components/BottomNav';
import { motion } from 'framer-motion';
import { Zap, Plus, Home, Users, Package, Trash2, ArrowRight } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';

const CATEGORIES = [
  { id: 'electricity', label: 'Electricity', icon: Zap },
  { id: 'rent', label: 'Rent', icon: Home },
  { id: 'wages', label: 'Wages', icon: Users },
  { id: 'supplies', label: 'Supplies', icon: Package },
];

export default function Expenses() {
  const { user, shopId } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Drawer state
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchExpenses = async () => {
      if (!shopId) return;
      try {
        const q = query(collection(db, `shops/${shopId}/expenses`), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Failed to fetch expenses", err);
      } finally {
        setLoading(false);
      }
    };
    fetchExpenses();
  }, [shopId]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!shopId || !amount) return;

    setSubmitting(true);
    try {
      const payload = {
        amount: parseFloat(amount),
        description,
        categoryId: category,
        creatorId: user.uid,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, `shops/${shopId}/expenses`), payload);

      // Optimistic addition
      setExpenses(prev => [{ id: docRef.id, ...payload, createdAt: { toDate: () => new Date() } }, ...prev]);

      // Reset form
      setAmount('');
      setDescription('');
      setCategory(CATEGORIES[0].id);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id) => {
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
      alert("Failed to delete expense. Reverted.");
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-gray-50 flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-indigo-50 text-indigo-600 p-2 rounded-full"
        >
          <Plus size={20} />
        </button>
      </header>

      <main className="flex-1 pb-24">
        {loading ? (
          <div className="flex flex-col divide-y divide-gray-100">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">No expenses recorded yet.</div>
        ) : (
          <div className="flex flex-col">
            {expenses.map(exp => {
              const CatIcon = CATEGORIES.find(c => c.id === exp.categoryId)?.icon || Package;
              return (
                <div key={exp.id} className="relative border-b border-gray-100 bg-red-50">
                  {/* Background Delete Button revealed on swipe */}
                  <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-end pr-6">
                    <button
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="p-3 bg-red-100 text-red-600 rounded-full hover:bg-red-200 active:bg-red-300"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>

                  {/* Draggable Foreground Item */}
                  <motion.div
                    drag="x"
                    dragConstraints={{ left: -100, right: 0 }}
                    dragElastic={0.2}
                    className="relative bg-white p-4 flex items-center justify-between z-10 shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-gray-50 p-3 rounded-full text-gray-600">
                        <CatIcon size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{exp.description || CATEGORIES.find(c => c.id === exp.categoryId)?.label}</h3>
                        <p className="text-sm text-gray-500">{exp.createdAt?.toDate ? exp.createdAt.toDate().toLocaleDateString() : 'Syncing...'}</p>
                      </div>
                    </div>
                    <span className="font-bold text-lg text-gray-900">₹{exp.amount}</span>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Drawer.Root open={isOpen} onOpenChange={setIsOpen}>
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
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-gray-500 font-medium text-lg">₹</span>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="block w-full pl-8 pr-4 py-4 border-2 border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-0 text-xl font-bold"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>

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

                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="block w-full px-4 py-4 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Note or description (optional)"
                  />

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
