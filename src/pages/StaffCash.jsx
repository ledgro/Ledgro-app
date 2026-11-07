import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from 'vaul';
import { toast } from 'sonner';
import { ChevronLeft, ChevronDown, Plus, Trash2, Pencil } from 'lucide-react';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { fetchAllPaged } from '../lib/firestoreUtils';
import { bizDate } from '../lib/statsMath';
import { staffBalances, cleanStaff, monthSummary, groupByMonth, personId } from '../lib/staffCash';
import { logActivity } from '../lib/audit';
import { useNameOf } from '../lib/memberNames';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { confirm } from '../lib/confirm';
import { formatCurrency, cn } from '../lib/utils';
import BottomNav from '../components/BottomNav';
import { ListSkeleton } from '../components/Skeleton';
import { useShowLoader } from '../hooks/useShowLoader';

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
  const showLoader = useShowLoader(entries === null);
  const [open, setOpen] = useState(false);
  const [openStaff, setOpenStaff] = useState(null);
  const [f, setF] = useState({ kind: 'advance', staff: '', amount: '', via: 'cash', note: '', monthly: '' });
  const [editing, setEditing] = useState(null); // entry being corrected (owner)
  const [salaries, setSalaries] = useState({}); // personId -> paise (owner only)
  const [salaryDraft, setSalaryDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      const docs = await fetchAllPaged(`shops/${shopId}/staffCash`);
      setEntries(docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      if (isAdmin) {
        const sal = await getDocs(query(collection(db, `shops/${shopId}/staffPeople`), limit(100)));
        setSalaries(Object.fromEntries(sal.docs.map((d) => [d.id, d.data().salary || 0])));
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not load staff cash. Check connection.');
      setEntries([]);
    }
  }, [shopId, isAdmin]);
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const monthStart = useMemo(() => { const d = bizDate(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; }, []);
  const people = useMemo(() => staffBalances(entries || [], monthStart), [entries, monthStart]);
  const totalOwed = people.reduce((a, p) => a + Math.max(0, p.owed), 0);
  const names = people.map((p) => p.name);

  const openAdd = () => { setEditing(null); setF({ kind: 'advance', staff: '', amount: '', via: 'cash', note: '', monthly: '' }); setOpen(true); };
  const openEdit = (e) => {
    setEditing(e);
    setF({ kind: e.kind, staff: e.staff, amount: String(e.amount / 100), via: e.via || 'cash', note: e.note || '', monthly: e.monthly ? String(e.monthly / 100) : '' });
    setOpen(true);
  };

  const save = async () => {
    if (saving) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const staff = cleanStaff(f.staff);
    const rupees = parseFloat(f.amount);
    const monthly = Math.round((parseFloat(f.monthly) || 0) * 100);
    if (!staff) { toast.error('Enter the staff name.'); return; }
    if (!editing && f.kind === 'repay' && f.via === 'salary' && !isAdmin) { toast.error('Only an admin can record a deduction from salary.'); return; }
    if (!Number.isFinite(rupees) || rupees <= 0) { toast.error('Enter a valid amount.'); return; }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const note = f.note.trim().slice(0, 200);
      if (editing) {
        const patch = { amount: Math.round(rupees * 100), note };
        if (editing.kind !== 'repay') patch.monthly = monthly;
        batch.update(doc(db, `shops/${shopId}/staffCash`, editing.id), patch);
        logActivity(batch, shopId, user.uid, { action: 'staff_edit', amount: patch.amount, note: `${editing.staff}: was ${formatCurrency(editing.amount)}` });
      } else {
        const data = { staff, kind: f.kind, amount: Math.round(rupees * 100), note, creatorId: user.uid, createdAt: serverTimestamp() };
        if (f.kind === 'repay') data.via = f.via;
        else if (monthly > 0) data.monthly = monthly;
        batch.set(doc(collection(db, `shops/${shopId}/staffCash`)), data);
      }
      await batch.commit();
      toast.success(editing ? 'Entry updated' : f.kind === 'repay' ? 'Repayment recorded' : 'Recorded');
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(`Could not save (${err?.code || 'error'}).`);
    } finally { setSaving(false); }
  };

  const saveSalary = async (p) => {
    const rupees = parseFloat(salaryDraft[p.key]);
    if (!Number.isFinite(rupees) || rupees < 0) { toast.error('Enter a valid salary.'); return; }
    try {
      await setDoc(doc(db, `shops/${shopId}/staffPeople`, personId(p.name)), { staff: p.name, salary: Math.round(rupees * 100), updatedAt: serverTimestamp() });
      toast.success('Salary saved');
      setSalaryDraft((d) => { const n = { ...d }; delete n[p.key]; return n; });
      await load();
    } catch (err) { toast.error(`Could not save (${err?.code || 'error'}).`); }
  };

  const remove = async (e) => {
    if (!(await confirm({ title: 'Delete this entry?', message: `${e.staff}: ${KIND_LABEL[e.kind]} ${formatCurrency(e.amount)}. Today's expected cash changes too.`, confirmText: 'Delete', danger: true }))) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, `shops/${shopId}/staffCash`, e.id));
      logActivity(batch, shopId, user.uid, { action: 'staff_delete', amount: e.amount, note: `${e.staff}: ${KIND_LABEL[e.kind]}` });
      await batch.commit();
      await load();
      toast.success('Deleted');
    } catch (err) { toast.error(`Could not delete (${err?.code || 'error'}).`); }
  };

  const kind = KINDS.find((k) => k.value === f.kind);

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-4 flex items-center gap-3 shadow-subtle">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="p-1 -ml-1 text-slate-500 active:bg-slate-100 rounded-full"><ChevronLeft size={24} /></button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Staff cash</h1>
        <button type="button" onClick={openAdd} className="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white active:scale-95"><Plus size={16} /> Add</button>
      </header>

      <main className="p-4 space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total still owed to the shop</p>
          <p className="text-3xl font-black text-slate-900 tabular-nums">{formatCurrency(totalOwed)}</p>
          <p className="mt-1 text-xs text-slate-500">Cash taken from the drawer is taken off Expected Cash. It is not a shop expense.</p>
        </div>

        {entries === null && (showLoader ? <ListSkeleton rows={4} /> : null)}
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
              <div className="border-t border-slate-100">
                {isAdmin && (() => {
                  const sum = monthSummary(p.entries, salaries[personId(p.name)] || 0, monthStart);
                  return (
                    <div className="space-y-2 bg-slate-50 p-4">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Monthly salary</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
                            <input className={cn(field, 'pl-7 h-11 font-bold')} type="number" inputMode="decimal"
                              value={salaryDraft[p.key] ?? (sum.salary ? String(sum.salary / 100) : '')}
                              onChange={(e) => setSalaryDraft((d) => ({ ...d, [p.key]: e.target.value.slice(0, 9) }))} />
                          </div>
                        </div>
                        {salaryDraft[p.key] !== undefined && <button type="button" onClick={() => saveSalary(p)} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">Save</button>}
                      </div>
                      {sum.salary > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 space-y-1">
                          <p className="flex justify-between"><span>Salary</span><b>{formatCurrency(sum.salary)}</b></p>
                          <p className="flex justify-between"><span>Cut from salary this month</span><b>- {formatCurrency(sum.cut)}</b></p>
                          <p className="flex justify-between border-t border-slate-100 pt-1 text-base"><span className="font-bold">Pay this month</span><b>{formatCurrency(sum.pay)}</b></p>
                          {sum.planned > 0 && <p className="text-xs text-amber-700">Planned monthly deduction {formatCurrency(sum.planned)}. Record it as Repayment, from salary.</p>}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {groupByMonth(p.entries).map((g) => (
                  <div key={g.label}>
                    <p className="bg-slate-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{g.label}</p>
                    <div className="divide-y divide-slate-50">
                      {g.items.map((e) => {
                        const at = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
                        return (
                          <div key={e.id} className="flex items-center gap-2 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-sm font-semibold', p.owed <= 0 && e.kind !== 'repay' ? 'text-slate-400 line-through' : 'text-slate-900')}>
                                {p.owed <= 0 && e.kind !== 'repay' && <span className="mr-1 rounded bg-green-50 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-green-700 no-underline">Closed</span>}
                                {KIND_LABEL[e.kind]}{e.kind === 'repay' ? (e.via === 'salary' ? ' (from salary)' : ' (cash)') : ''} · {formatCurrency(e.amount)}
                              </p>
                              <p className="text-xs text-slate-500">{at.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · by {nameOf(e.creatorId)}{e.monthly ? ` · ${formatCurrency(e.monthly)}/month` : ''}{e.note ? ` · ${e.note}` : ''}</p>
                            </div>
                            {isAdmin && <button type="button" aria-label="Edit entry" onClick={() => openEdit(e)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Pencil size={16} /></button>}
                            {isAdmin && <button type="button" aria-label="Delete entry" onClick={() => remove(e)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-red-600"><Trash2 size={16} /></button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
              <Drawer.Title className="font-bold text-slate-900 text-xl">{editing ? 'Edit entry' : 'Cash taken by staff'}</Drawer.Title>
              <button type="button" aria-label="Close" onClick={() => !saving && setOpen(false)} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500">✕</button>
            </div>
            <Drawer.Description className="sr-only">Record cash a staff member took or paid back</Drawer.Description>
            <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-4">
              {!editing && <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Type">
                {KINDS.map((k) => (
                  <button key={k.value} type="button" onClick={() => setF((p) => ({ ...p, kind: k.value }))}
                    className={cn('flex-1 rounded-lg py-2.5 text-xs font-bold', f.kind === k.value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>{k.label}</button>
                ))}
              </div>}
              {!editing && <p className="text-xs font-semibold text-slate-500">{kind.hint}</p>}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Staff name</label>
                <input className={field} value={f.staff} maxLength={40} disabled={!!editing} onChange={(e) => setF((p) => ({ ...p, staff: e.target.value }))} />
                {!editing && names.length > 0 && (
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
              {f.kind !== 'repay' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Monthly deduction (optional)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
                    <input className={cn(field, 'pl-8 font-bold')} type="number" inputMode="decimal" value={f.monthly} placeholder="e.g. 2000 a month" onChange={(e) => setF((p) => ({ ...p, monthly: e.target.value.slice(0, 9) }))} />
                  </div>
                </div>
              )}
              {!editing && f.kind === 'repay' && (
                <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="How was it paid back">
                  {[['cash', 'Cash back into drawer'], ...(isAdmin ? [['salary', 'Deducted from salary']] : [])].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setF((p) => ({ ...p, via: v }))} className={cn('flex-1 rounded-lg py-2.5 text-xs font-bold', f.via === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>{l}</button>
                  ))}
                </div>
              )}
              {!editing && f.kind === 'repay' && !isAdmin && <p className="text-xs font-semibold text-slate-500">A deduction from salary is recorded by an admin.</p>}
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
