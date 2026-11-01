import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from 'vaul';
import { toast } from 'sonner';
import { ChevronLeft, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { fetchAllPaged } from '../lib/firestoreUtils';
import { bizDate } from '../lib/statsMath';
import { staffBalances, cleanStaff } from '../lib/staffCash';
import { useNameOf } from '../lib/memberNames';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { confirm } from '../lib/confirm';
import { formatCurrency, cn } from '../lib/utils';
import BottomNav from '../components/BottomNav';

const KINDS = [
  { value: 'advance', label: 'Salary advance', hint: 'Taken now, deducted from salary later.' },
  { value: 'debt', label: 'Debt (loan)', hint: 'Taken as a loan, paid back later.' },
  { value: 'repay', label: 'Repayment', hint: 'Money paid back.' },
];
const KIND_LABEL = { advance: 'Advance', debt: 'Debt', repay: 'Repaid' };
const field = 'w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900';

export default function StaffCash() {
  const navigate = useNavigate();
  const { shopId, user, isAdmin } = useAuth();
  const nameOf = useNameOf(shopId, user?.uid);
  const [entries, setEntries] = useState(null);
  const [open, setOpen] = useState(false);
  const [openStaff, setOpenStaff] = useState(null);
  const [f, setF] = useState({ kind: 'advance', staff: '', amount: '', via: 'cash', note: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      const docs = await fetchAllPaged(`shops/${shopId}/staffCash`);
      setEntries(docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
    } catch (err) {
      console.error(err);
      toast.error('Could not load staff cash. Check connection.');
      setEntries([]);
    }
  }, [shopId]);
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const monthStart = useMemo(() => { const d = bizDate(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; }, []);
  const people = useMemo(() => staffBalances(entries || [], monthStart), [entries, monthStart]);
  const totalOwed = people.reduce((a, p) => a + Math.max(0, p.owed), 0);
  const names = people.map((p) => p.name);

  const save = async () => {
    if (saving) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const staff = cleanStaff(f.staff);
    const rupees = parseFloat(f.amount);
    if (!staff) { toast.error('Enter the staff name.'); return; }
    if (f.kind === 'repay' && f.via === 'salary' && !isAdmin) { toast.error('Only an admin can record a deduction from salary.'); return; }
    if (!Number.isFinite(rupees) || rupees <= 0) { toast.error('Enter a valid amount.'); return; }
    setSaving(true);
    try {
      const data = { staff, kind: f.kind, amount: Math.round(rupees * 100), note: f.note.trim().slice(0, 200), creatorId: user.uid, createdAt: serverTimestamp() };
      if (f.kind === 'repay') data.via = f.via;
      await addDoc(collection(db, `shops/${shopId}/staffCash`), data);
      toast.success(f.kind === 'repay' ? 'Repayment recorded' : 'Recorded');
      setOpen(false);
      setF((p) => ({ ...p, amount: '', note: '' }));
      await load();
    } catch (err) {
      console.error(err);
      toast.error(`Could not save (${err?.code || 'error'}).`);
    } finally { setSaving(false); }
  };

  const remove = async (e) => {
    if (!(await confirm({ title: 'Delete this entry?', message: `${e.staff}: ${KIND_LABEL[e.kind]} ${formatCurrency(e.amount)}. Today's expected cash changes too.`, confirmText: 'Delete', danger: true }))) return;
    try { await deleteDoc(doc(db, `shops/${shopId}/staffCash`, e.id)); await load(); toast.success('Deleted'); } catch (err) { toast.error(`Could not delete (${err?.code || 'error'}).`); }
  };

  const kind = KINDS.find((k) => k.value === f.kind);

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-4 flex items-center gap-3 shadow-subtle">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="p-1 -ml-1 text-slate-500 active:bg-slate-100 rounded-full"><ChevronLeft size={24} /></button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Staff cash</h1>
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white active:scale-95"><Plus size={16} /> Add</button>
      </header>

      <main className="p-4 space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total still owed to the shop</p>
          <p className="text-3xl font-black text-slate-900 tabular-nums">{formatCurrency(totalOwed)}</p>
          <p className="mt-1 text-xs text-slate-500">Cash taken from the drawer is taken off Expected Cash. It is not a shop expense.</p>
        </div>

        {entries === null && <p className="py-10 text-center text-slate-500">Loading...</p>}
        {entries && people.length === 0 && <p className="py-10 text-center text-slate-500">No entries yet. Tap Add when someone takes cash.</p>}

        {people.map((p) => (
          <section key={p.key} className="rounded-2xl bg-white shadow-sm border border-slate-100 overflow-hidden">
            <button type="button" onClick={() => setOpenStaff(openStaff === p.key ? null : p.key)} className="flex w-full items-center gap-3 p-4 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">Advance {formatCurrency(p.advance)} · Debt {formatCurrency(p.debt)} · Repaid {formatCurrency(p.repaid)}</p>
                {p.thisMonth > 0 && <p className="text-xs font-semibold text-amber-700">Took {formatCurrency(p.thisMonth)} this month</p>}
              </div>
              <div className="text-right">
                <p className={cn('text-lg font-black tabular-nums', p.owed > 0 ? 'text-red-600' : 'text-green-700')}>{formatCurrency(Math.abs(p.owed))}</p>
                <p className="text-[0.7rem] font-semibold text-slate-500">{p.owed > 0 ? 'owes' : p.owed < 0 ? 'overpaid' : 'settled'}</p>
              </div>
              <ChevronDown size={18} className={cn('text-slate-400 transition-transform', openStaff === p.key && 'rotate-180')} />
            </button>
            {openStaff === p.key && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {[...p.entries].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).map((e) => {
                  const at = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {KIND_LABEL[e.kind]}{e.kind === 'repay' ? (e.via === 'salary' ? ' (from salary)' : ' (cash)') : ''} · {formatCurrency(e.amount)}
                        </p>
                        <p className="text-xs text-slate-500">{at.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · by {nameOf(e.creatorId)}{e.note ? ` · ${e.note}` : ''}</p>
                      </div>
                      {isAdmin && <button type="button" aria-label="Delete entry" onClick={() => remove(e)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-red-600"><Trash2 size={16} /></button>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </main>

      <Drawer.Root handleOnly repositionInputs={false} open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} className="bg-white flex flex-col rounded-t-[20px] mt-24 max-h-[85vh] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <Drawer.Title className="font-bold text-slate-900 text-xl">Cash taken by staff</Drawer.Title>
              <button type="button" aria-label="Close" onClick={() => !saving && setOpen(false)} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500">✕</button>
            </div>
            <Drawer.Description className="sr-only">Record cash a staff member took or paid back</Drawer.Description>
            <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-4">
              <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Type">
                {KINDS.map((k) => (
                  <button key={k.value} type="button" onClick={() => setF((p) => ({ ...p, kind: k.value }))}
                    className={cn('flex-1 rounded-lg py-2.5 text-xs font-bold', f.kind === k.value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>{k.label}</button>
                ))}
              </div>
              <p className="text-xs font-semibold text-slate-500">{kind.hint}</p>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Staff name</label>
                <input className={field} value={f.staff} maxLength={40} onChange={(e) => setF((p) => ({ ...p, staff: e.target.value }))} />
                {names.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {names.slice(0, 8).map((n) => <button key={n} type="button" onClick={() => setF((p) => ({ ...p, staff: n }))} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{n}</button>)}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
                  <input className={cn(field, 'pl-8 font-bold')} type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF((p) => ({ ...p, amount: e.target.value.slice(0, 9) }))} />
                </div>
              </div>
              {f.kind === 'repay' && (
                <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="How was it paid back">
                  {[['cash', 'Cash back into drawer'], ...(isAdmin ? [['salary', 'Deducted from salary']] : [])].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setF((p) => ({ ...p, via: v }))} className={cn('flex-1 rounded-lg py-2.5 text-xs font-bold', f.via === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>{l}</button>
                  ))}
                </div>
              )}
              {f.kind === 'repay' && !isAdmin && <p className="text-xs font-semibold text-slate-500">A deduction from salary is recorded by an admin.</p>}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Note (optional)</label>
                <input className={field} value={f.note} maxLength={200} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 border-t border-slate-100 bg-white p-4 pb-safe">
              <button type="button" disabled={saving} onClick={save} className="h-14 w-full rounded-xl bg-blue-600 font-bold text-white active:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
