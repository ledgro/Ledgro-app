import { sheetStyle } from '../hooks/useKeyboardInset';
import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import StaffCash from './StaffCash';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, getDocs, serverTimestamp, writeBatch, doc, limit } from 'firebase/firestore';
import { writeStats } from '../lib/dayStats';
import { bizDayKey, toDate, expenseDelta, negate } from '../lib/statsMath';
import { serverNow, CLOCK_MSG } from '../lib/clockDrift';
import { db } from '../firebase';
import { Drawer } from 'vaul';
import BottomNav from '../components/BottomNav';
import { motion } from 'framer-motion';
import { logActivity } from '../lib/audit';
import SwipeRow from '../components/SwipeRow';
import { Zap, Plus, Home, Users, Package, Trash2, HandCoins, Wallet } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { useBodyLock } from '../hooks/useBodyLock';
import { hapticVibrate } from '../lib/utils';
import { useNameOf } from '../lib/memberNames';
import { confirm } from '../lib/confirm';

const CATEGORIES = [
  { id: 'electricity', label: 'Electricity', icon: Zap },
  { id: 'rent', label: 'Rent', icon: Home },
  { id: 'wages', label: 'Wages', icon: Users },
  { id: 'supplies', label: 'Supplies', icon: Package },
  { id: 'other', label: 'Other', icon: Wallet },
];

export default function Expenses() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'staff' ? 'staff' : 'expenses';
  const { user, shopId, shopAdminId } = useAuth();
  const nameOf = useNameOf(shopId, user?.uid);
  const isAdmin = user?.uid === shopAdminId;
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');

  useBodyLock(isOpen);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [paidVia, setPaidVia] = useState('cash'); // 'cash' | 'upi' | 'staff' (staff paid from own pocket, not in the drawer, owed back)
  const [fetchError, setFetchError] = useState(false);
  const [editing, setEditing] = useState(null);

  /** Owner any time; the person who added it within 24 hours. Rules enforce the same on save. */
  const owedToStaff = expenses.filter((e) => e.paidVia === 'staff').reduce((n, e) => n + (Number(e.amount) || 0), 0);

  const canEdit = (e) => {
    if (isAdmin) return true;
    const created = e.createdAt?.toDate ? e.createdAt.toDate().getTime() : 0;
    // oxlint-disable-next-line react/purity
    return e.creatorId === user?.uid && created > 0 && Date.now() - created < 24 * 60 * 60 * 1000;
  };

  const openEdit = (e) => {
    if (!canEdit(e)) return;
    setEditing(e);
    setAmount(String((e.amount || 0) / 100));
    setDescription(e.description || '');
    setCategory(e.category || CATEGORIES[0].id);
    setPaidVia(e.paidVia || 'cash');
    setIsOpen(true);
  };

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

  // oxlint-disable-next-line react/set-state-in-effect
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
    if (editing) {
      try {
        const next = { amount: parsedAmount, description: description.trim().slice(0, 200), category, paidVia };
        const key = bizDayKey(toDate(editing.createdAt));
        const batch = writeBatch(db);
        batch.update(doc(db, `shops/${shopId}/expenses`, editing.id), { ...next, updatedAt: serverTimestamp() });
        writeStats(batch, shopId, [
          { key, delta: negate(expenseDelta(editing)) },
          { key, delta: expenseDelta({ ...editing, ...next }) },
        ]);
        await batch.commit();
        setExpenses((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...next } : x)));
        setEditing(null);
        setAmount(''); setDescription(''); setPaidVia('cash'); setCategory(CATEGORIES[0].id);
        setIsOpen(false);
        hapticVibrate(10);
        toast.success('Expense updated');
      } catch (err) {
        console.error(err);
        toast.error('Could not update the expense. Nothing was changed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
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

      const newDocRef = doc(collection(db, `shops/${shopId}/expenses`));
      const batch = writeBatch(db);
      batch.set(newDocRef, payload);
      writeStats(batch, shopId, [{ key: bizDayKey(await serverNow()), delta: expenseDelta(payload) }]);
      await batch.commit();

      setExpenses(prev => [{ id: newDocRef.id, ...payload, createdAt: { toDate: () => new Date() } }, ...prev]);

      setPaidVia('cash');
      setAmount('');
      setDescription('');
      setCategory(CATEGORIES[0].id);
      setIsOpen(false);
      hapticVibrate(10);
    } catch (err) {
      console.error(err);
      toast.error(err?.message === 'CLOCK' ? CLOCK_MSG : "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!(await confirm({ title: 'Delete expense?', message: 'This expense will be removed.', confirmText: 'Delete', danger: true }))) return;
    const previousExpenses = [...expenses];
    setExpenses(prev => prev.filter(e => e.id !== id));

    try {
      const gone = previousExpenses.find((e) => e.id === id);
      const batch = writeBatch(db);
      batch.delete(doc(db, `shops/${shopId}/expenses`, id));
      if (gone) logActivity(batch, shopId, user.uid, { action: 'expense_delete', amount: gone.amount, note: `${gone.category || ''} ${gone.description || ''}`.trim() });
      if (gone) writeStats(batch, shopId, [{ key: bizDayKey(toDate(gone.createdAt)), delta: negate(expenseDelta(gone)) }]);
      await batch.commit();
    } catch (err) {
      console.error("Failed to delete expense", err);
      setExpenses(previousExpenses);
      toast.error("Failed to delete expense. Reverted.");
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-gray-50 page-bg flex flex-col overflow-x-hidden">
      <header className="sticky top-0 z-30 glass-header px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
        {tab === 'expenses' && <button
          aria-label="New Expense"
          onClick={() => setIsOpen(true)}
          className="bg-gray-900 hover:bg-gray-800 active:scale-95 transition-all text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm"
        >
          <Plus size={16} /> New
        </button>}
      </header>

      <div role="tablist" aria-label="Expense type" className="grid grid-cols-2 gap-2 px-4 pt-3">
        {[['expenses', 'Shop expenses'], ['staff', 'Staff cash']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'staff' ? { tab: 'staff' } : {}, { replace: true })}
            className={`press h-11 rounded-full text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow-md' : 'glass-btn-flat text-slate-600'}`}>{l}</button>
        ))}
      </div>

      {tab === 'staff' ? <main className="p-4 flex-1 pb-nav"><StaffCash embedded /></main> : <main className="p-4 flex-1 pb-nav">
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
            {owedToStaff > 0 && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm font-semibold text-amber-800">
                Owed to staff: ₹{(owedToStaff / 100).toLocaleString('en-IN')}. Paid from their own pocket. When you repay, edit the entry and set Drawer Cash or Bank / UPI.
              </div>
            )}
            <div className="absolute left-[39px] top-6 bottom-6 w-[2px] bg-slate-100 -z-10 rounded-full" />

            {expenses.map(expense => {
              const cat = CATEGORIES.find(c => c.id === expense.category);
              const Icon = cat ? cat.icon : expense.category === 'staff_loan' ? HandCoins : Package;
              const date = expense.createdAt?.toDate ? expense.createdAt.toDate().toLocaleString([], {month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'}) : 'Just now';

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={expense.id}
                  className=""
                >
                  <SwipeRow
                    onTap={() => openEdit(expense)}
                    action={isAdmin ? (
                      <button type="button" aria-label="Delete Expense" className="flex-1 bg-red-600 text-white flex flex-col items-center justify-center gap-1 text-xs font-bold" onClick={() => handleDeleteExpense(expense.id)}>
                        <Trash2 size={20} strokeWidth={2.5} />Delete
                      </button>
                    ) : null}
                  >
                  <div className={`p-4 flex items-center gap-4 border border-slate-100 rounded-3xl shadow-sm ${canEdit(expense) ? 'cursor-pointer' : ''}`}>
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm shrink-0">
                    <Icon size={20} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 truncate pr-2">{expense.description || cat?.label || 'Other'}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                       <p className="text-xs font-semibold text-slate-500">{date}</p>
                       <span className="text-xs font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase">{expense.paidVia === 'staff' ? 'owed to staff' : (expense.paidVia || 'cash')}</span>
                       <span className="text-xs font-semibold text-slate-500 truncate">{nameOf(expense.creatorId)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-900 text-lg">₹{(expense.amount / 100).toLocaleString('en-IN')}</p>
                  </div>

                  </div>
                  </SwipeRow>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>}

      <Drawer.Root handleOnly repositionInputs={false} open={isOpen} onOpenChange={(open) => {
         setIsOpen(open);
         if (!open) {
            setEditing(null);
            setAmount('');
            setDescription('');
            setCategory(CATEGORIES[0].id);
         }
      }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} className="bg-white flex flex-col rounded-t-[10px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-[61] focus:outline-none">
            <div className="p-4 bg-white rounded-t-[10px] flex-1 pb-safe overflow-y-auto">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-300 mb-6" />
              <div className="max-w-md mx-auto">
                <Drawer.Title className="font-bold text-gray-900 mb-6 text-xl">
                  {editing ? 'Edit Expense' : 'Add Expense'}
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
                    />
                  </div>
                </div>

                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Paid Via</label>
                   <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button type="button" onClick={() => setPaidVia('cash')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${paidVia === 'cash' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Drawer Cash</button>
                      <button type="button" onClick={() => setPaidVia('upi')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${paidVia === 'upi' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Bank / UPI</button>
                      <button type="button" onClick={() => setPaidVia('staff')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${paidVia === 'staff' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Staff pocket</button>
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

                <div className="sheet-foot flex gap-2 pt-2">
                  {editing && isAdmin && (
                    <button type="button" onClick={async () => { const id = editing.id; setIsOpen(false); setEditing(null); await handleDeleteExpense(id); }} className="press h-14 rounded-xl bg-red-50 px-4 font-bold text-red-600">Delete</button>
                  )}
                  {(editing ? (description !== (editing.description || '') || Math.round(parseFloat(amount || 0) * 100) !== (editing.amount || 0)) : (!!amount || !!description)) && (
                    <button type="button" onClick={() => { if (!submitting) setIsOpen(false); }} className="press h-14 rounded-xl bg-slate-100 px-4 font-bold text-slate-700">Discard</button>
                  )}
                  <button type="submit" disabled={submitting || !amount} className="press flex h-14 flex-1 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-50">
                    {submitting ? 'Saving...' : editing ? 'Save' : 'Save Expense'}
                  </button>
                </div>
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
