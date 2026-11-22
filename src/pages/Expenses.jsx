import { sheetStyle } from '../hooks/useKeyboardInset';
import FieldError, { errRing } from '../components/FieldError';
import { toast } from 'sonner';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import StaffCash from './StaffCash';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, getDocs, serverTimestamp, writeBatch, doc, limit, startAfter, where, Timestamp } from 'firebase/firestore';
import { writeStats } from '../lib/dayStats';
import { expenseEntries, negate } from '../lib/statsMath';
import { isPending } from '../lib/expenses';
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
  const [amountErr, setAmountErr] = useState('');

  useBodyLock(isOpen);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [paidVia, setPaidVia] = useState('cash'); // 'cash' | 'upi' | 'staff' (staff paid from own pocket, not in the drawer, owed back)
  const [fetchError, setFetchError] = useState(false);
  const [editing, setEditing] = useState(null);

  /** Owner any time; the person who added it within 24 hours. Rules enforce the same on save. */
  const [owedToStaff, setOwedToStaff] = useState(0); // from its own queries, so older entries never fall off the totals
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [filter, setFilter] = useState('all'); // all | unpaid | paid
  const [hasMore, setHasMore] = useState(false);
  const shown = expenses.filter((e) => filter === 'all' || (filter === 'unpaid' ? isPending(e) : !isPending(e)));
  const [loadingMore, setLoadingMore] = useState(false);
  const lastDocRef = useRef(null);


  /** Owner marks an unpaid / staff-pocket expense as paid: the cash moves on the day of payment, the original day is untouched. */
  const markPaid = async (e, via) => {
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, `shops/${shopId}/expenses`, e.id), { paidVia: via, paidAt: serverTimestamp(), updatedAt: serverTimestamp() });
      const after = { ...e, paidVia: via, paidAt: await serverNow() };
      writeStats(batch, shopId, [...expenseEntries(e).map((x) => ({ ...x, delta: negate(x.delta) })), ...expenseEntries(after)]);
      logActivity(batch, shopId, user.uid, { action: 'expense_paid', amount: e.amount, note: `${via} ${e.description || e.category || ''}`.trim() });
      await batch.commit();
      setExpenses((prev) => prev.map((x) => (x.id === e.id ? { ...after, paidAt: Timestamp.now() } : x)));
      fetchOwed();
      hapticVibrate(10);
      toast.success(`Marked paid (${via === 'cash' ? 'drawer cash' : 'bank / UPI'})`);
    } catch (err) {
      console.error(err);
      toast.error('Could not mark it paid. Nothing was changed.');
    }
  };

  const canEdit = (e) => {
    if (isAdmin) return true;
    const created = e.createdAt?.toDate ? e.createdAt.toDate().getTime() : 0;
    // oxlint-disable-next-line react/purity
    return e.creatorId === user?.uid && created > 0 && Date.now() - created < 24 * 60 * 60 * 1000;
  };

  /** The one way to close the sheet: always clears what was typed, so New can never show an old expense. */
  const closeSheet = () => {
    setIsOpen(false);
    setEditing(null);
    setAmount(''); setAmountErr('');
    setDescription('');
    setCategory(CATEGORIES[0].id);
    setPaidVia('cash');
  };
  const openNew = () => {
    setEditing(null); setAmount(''); setAmountErr(''); setDescription(''); setCategory(CATEGORIES[0].id); setPaidVia('cash');
    setIsOpen(true);
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

  const PAGE = 50;
  const readDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
  const fetchOwed = useCallback(async () => {
    if (!shopId) return;
    try {
      const sum = (snap) => snap.docs.reduce((n, d) => n + (Number(d.data().amount) || 0), 0);
      const [staff, unpaid] = await Promise.all([
        getDocs(query(collection(db, `shops/${shopId}/expenses`), where('paidVia', '==', 'staff'), limit(100))),
        getDocs(query(collection(db, `shops/${shopId}/expenses`), where('paidVia', '==', 'unpaid'), limit(100))),
      ]);
      setOwedToStaff(sum(staff));
      setUnpaidTotal(sum(unpaid));
    } catch (err) { console.warn('Could not total what is owed to staff', err); }
  }, [shopId]);

  const fetchExpenses = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setFetchError(false);
    try {
      const snap = await getDocs(query(collection(db, `shops/${shopId}/expenses`), orderBy('createdAt', 'desc'), limit(PAGE)));
      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      setHasMore(snap.docs.length === PAGE);
      setExpenses(readDocs(snap));
      fetchOwed();
    } catch (err) {
      console.error("Failed to fetch expenses", err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [shopId, fetchOwed]);

  const loadMore = async () => {
    if (!lastDocRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(collection(db, `shops/${shopId}/expenses`), orderBy('createdAt', 'desc'), startAfter(lastDocRef.current), limit(PAGE)));
      if (snap.docs.length) lastDocRef.current = snap.docs[snap.docs.length - 1];
      setHasMore(snap.docs.length === PAGE);
      const more = readDocs(snap);
      setExpenses((prev) => [...prev, ...more.filter((m) => !prev.some((x) => x.id === m.id))]);
    } catch (err) {
      console.error('Failed to load more expenses', err);
      toast.error('Could not load more. Check your connection.');
    } finally { setLoadingMore(false); }
  };

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = Math.round(parseFloat(amount) * 100);
    if (!shopId || !parsedAmount || parsedAmount <= 0) {
      setAmountErr(amount === '' ? 'Enter how much you spent in rupees.' : 'Amount must be more than 0.');
      return;
    }
    setAmountErr('');

    if (!navigator.onLine) {
      toast.error('You are offline. Reconnect and try again. Nothing was saved.');
      return;
    }

    setSubmitting(true);
    if (editing) {
      try {
        const next = { amount: parsedAmount, description: description.trim().slice(0, 200), category, paidVia };
        // Paying a pending (unpaid / staff-pocket) expense: stamp the payment time so the cash lands on today, not the day it was made.
        const paying = isPending(editing) && (paidVia === 'cash' || paidVia === 'upi');
        const batch = writeBatch(db);
        batch.update(doc(db, `shops/${shopId}/expenses`, editing.id), { ...next, ...(paying ? { paidAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() });
        const after = { ...editing, ...next, ...(paying ? { paidAt: Timestamp.now() } : {}) };
        writeStats(batch, shopId, [
          ...expenseEntries(editing).map((x) => ({ ...x, delta: negate(x.delta) })),
          ...expenseEntries(after),
        ]);
        await batch.commit();
        setExpenses((prev) => prev.map((x) => (x.id === editing.id ? after : x)));
        closeSheet();
        fetchOwed();
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
      writeStats(batch, shopId, expenseEntries({ ...payload, createdAt: await serverNow() }));
      await batch.commit();

      setExpenses(prev => [{ id: newDocRef.id, ...payload, createdAt: Timestamp.now() }, ...prev]);
      closeSheet();
      fetchOwed();
      hapticVibrate(10);
    } catch (err) {
      console.error(err);
      toast.error(err?.message === 'CLOCK' ? CLOCK_MSG : "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const expDirty = editing
    ? (description !== (editing.description || '') || Math.round(parseFloat(amount || 0) * 100) !== (editing.amount || 0) || category !== editing.category || paidVia !== (editing.paidVia || 'cash'))
    : (!!amount || !!description);
  // What the rules allow when editing: once paid the method is final, and only the owner can mark a pending expense paid.
  const payOptDisabled = (v) => !!editing && (!!editing.paidAt || (isPending(editing) && !isAdmin && (v === 'cash' || v === 'upi')));
  const requestClose = async () => {
    if (submitting) return;
    if (expDirty && !(await confirm({ title: 'Discard changes?', message: 'What you entered will be lost.', confirmText: 'Discard', cancelText: 'Keep editing', danger: true }))) return;
    if (expDirty) toast('Discarded');
    closeSheet();
  };

  const handleDeleteExpense = async (id) => {
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const target = expenses.find((e) => e.id === id);
    const what = target ? `"${target.description || 'Expense'}" (₹${(Number(target.amount || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })})` : 'This expense';
    if (!(await confirm({ title: 'Delete expense?', message: `${what} will be removed and the totals adjusted. It cannot be restored.`, confirmText: 'Delete', danger: true }))) return;
    const previousExpenses = [...expenses];
    setExpenses(prev => prev.filter(e => e.id !== id));

    try {
      const gone = previousExpenses.find((e) => e.id === id);
      const batch = writeBatch(db);
      batch.delete(doc(db, `shops/${shopId}/expenses`, id));
      if (gone) logActivity(batch, shopId, user.uid, { action: 'expense_delete', amount: gone.amount, note: `${gone.category || ''} ${gone.description || ''}`.trim() });
      if (gone) writeStats(batch, shopId, expenseEntries(gone).map((x) => ({ ...x, delta: negate(x.delta) })));
      await batch.commit();
      if (editing?.id === id) closeSheet();
      fetchOwed();
      toast.success('Expense deleted');
    } catch (err) {
      console.error("Failed to delete expense", err);
      setExpenses(previousExpenses);
      toast.error("Failed to delete expense. Reverted.");
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-gray-50 page-bg flex flex-col overflow-x-hidden">
      <header className="px-5 pt-5 pb-1 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Expenses</h1>
        {tab === 'expenses' && <button
          aria-label="New Expense"
          onClick={openNew}
          className="bg-blue-600 active:scale-95 transition-all text-white h-11 px-4 rounded-full text-sm font-bold flex items-center gap-1.5"
        >
          <Plus size={16} /> New
        </button>}
      </header>

      <div role="tablist" aria-label="Expense type" className="grid grid-cols-2 gap-2 px-5 pt-3">
        {[['expenses', 'Shop expenses'], ['staff', 'Staff cash']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'staff' ? { tab: 'staff' } : {}, { replace: true })}
            className={`press h-11 rounded-full text-sm font-bold ${tab === k ? 'bg-blue-600 text-white shadow-md' : 'glass-btn-flat text-slate-600'}`}>{l}</button>
        ))}
      </div>

      {tab === 'staff' ? <main className="p-4 flex-1 pb-nav"><StaffCash embedded /></main> : <main className="px-5 py-3 flex-1 pb-nav">
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
          <div className="space-y-4">
            {(owedToStaff > 0 || unpaidTotal > 0) && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm font-semibold text-amber-800 space-y-0.5">
                {unpaidTotal > 0 && <p>Unpaid: ₹{(unpaidTotal / 100).toLocaleString('en-IN')}</p>}
                {owedToStaff > 0 && <p>Owed to staff: ₹{(owedToStaff / 100).toLocaleString('en-IN')} (paid from their own pocket)</p>}
                <p className="text-xs font-medium">{isAdmin ? 'Tap Paid cash or Paid UPI on a row when you pay it. The cash is counted on the day you pay.' : 'Only the owner can mark these as paid.'}</p>
              </div>
            )}
            <div className="flex gap-2" role="group" aria-label="Filter">
              {[['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`press h-9 rounded-full px-4 text-sm font-bold ${filter === k ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'}`}>{l}</button>
              ))}
            </div>
          <div className="divide-y divide-slate-200/80 relative">
            {shown.map(expense => {
              const cat = CATEGORIES.find(c => c.id === expense.category);
              const Icon = cat ? cat.icon : expense.category === 'staff_loan' ? HandCoins : Package;
              const made = expense.createdAt?.toDate ? expense.createdAt.toDate() : null;
              const date = made ? made.toLocaleString([], { month: 'short', day: 'numeric', ...(made.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' }) : 'Just now';
              const via = expense.paidVia === 'staff' ? 'owed to staff' : (expense.paidVia || 'cash');

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
                  <div className={`py-3 flex items-center gap-3 ${canEdit(expense) ? 'cursor-pointer' : ''}`}>
                  <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Icon size={20} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 truncate pr-2">{expense.description || cat?.label || 'Other'}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
                       <p className="text-xs font-semibold text-slate-500">{date}</p>
                       <span className="text-xs font-semibold text-slate-500 truncate">{nameOf(expense.creatorId)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-slate-900 text-base tabular-nums whitespace-nowrap">₹{(expense.amount / 100).toLocaleString('en-IN')}</p>
                    <span className={`text-xs font-bold uppercase whitespace-nowrap ${isPending(expense) ? 'text-amber-600' : 'text-green-600'}`}>{isPending(expense) ? (expense.paidVia === 'staff' ? 'Owed to staff' : 'Unpaid') : `Paid · ${via}`}</span>
                  </div>

                  </div>
                  </SwipeRow>
                  {isAdmin && isPending(expense) && (
                    <div className="flex gap-2 pb-3 pl-14">
                      <button type="button" onClick={() => markPaid(expense, 'cash')} className="press h-9 rounded-full bg-blue-600 px-4 text-xs font-bold text-white">Paid cash</button>
                      <button type="button" onClick={() => markPaid(expense, 'upi')} className="press h-9 rounded-full border border-blue-600 px-4 text-xs font-bold text-blue-600">Paid UPI</button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
          {hasMore && <button type="button" onClick={loadMore} disabled={loadingMore} className="press w-full h-11 rounded-full border border-slate-200 text-sm font-bold text-blue-600 disabled:opacity-50">{loadingMore ? 'Loading...' : 'Load more'}</button>}
          </div>
        )}
      </main>}

      <Drawer.Root handleOnly repositionInputs={false} open={isOpen} onOpenChange={(open) => {
         if (!open) { if (isOpen) requestClose(); return; }
         setIsOpen(true);
      }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} className="bg-white flex flex-col rounded-t-[10px] mt-24 h-auto max-h-[90dvh] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none">
            <div className="p-4 bg-white rounded-t-[10px] flex-1 min-h-0 pb-safe overflow-y-auto">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-300 mb-6" />
              <div className="max-w-md mx-auto">
                <Drawer.Title className="font-bold text-gray-900 mb-6 text-xl">
                  {editing ? 'Edit Expense' : 'Add Expense'}
                </Drawer.Title>

              <form noValidate onSubmit={handleAddExpense} className="space-y-6">
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
                      min="0"
                      step="0.01"
                      value={amount}
                      aria-invalid={!!amountErr}
                      onChange={(e) => { setAmount(e.target.value.slice(0, 10)); setAmountErr(''); }}
                      className={'block w-full pl-8 pr-4 py-4 border-2 border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-0 text-xl font-bold' + errRing(amountErr)}
                    />
                  </div>
                  <FieldError>{amountErr}</FieldError>
                </div>

                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Paid Via</label>
                   <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                      <button type="button" disabled={payOptDisabled('cash')} onClick={() => setPaidVia('cash')} className={`py-2 text-sm font-bold rounded-lg transition-all disabled:opacity-40 ${paidVia === 'cash' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Drawer Cash</button>
                      <button type="button" disabled={payOptDisabled('upi')} onClick={() => setPaidVia('upi')} className={`py-2 text-sm font-bold rounded-lg transition-all disabled:opacity-40 ${paidVia === 'upi' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Bank / UPI</button>
                      <button type="button" disabled={payOptDisabled('staff')} onClick={() => setPaidVia('staff')} className={`py-2 text-sm font-bold rounded-lg transition-all disabled:opacity-40 ${paidVia === 'staff' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Staff pocket</button>
                      <button type="button" disabled={payOptDisabled('unpaid')} onClick={() => setPaidVia('unpaid')} className={`py-2 text-sm font-bold rounded-lg transition-all disabled:opacity-40 ${paidVia === 'unpaid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Not paid yet</button>
                   </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map(cat => {
                      const Icon = cat.icon;
                      const isSelected = category === cat.id;
                      return (
                        <button
                          type="button"
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-colors ${isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}
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
                  {editing && isAdmin && <button type="button" aria-label="Delete expense" onClick={() => handleDeleteExpense(editing.id)} className="press flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><Trash2 size={20} /></button>}
                  {expDirty && (
                    <button type="button" onClick={requestClose} className="press h-14 rounded-xl bg-slate-100 px-4 font-bold text-slate-700">Discard</button>
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
