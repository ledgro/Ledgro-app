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
import { staffBalances, cleanStaff, periodSummary, loanStatus, groupByMonth, personId } from '../lib/staffCash';
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
const KIND_LABEL = { advance: 'Advance', debt: 'Debt', repay: 'Repaid', work: 'Worked', payout: 'Wage paid', close: 'Settled up' };
const CYCLES = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']];
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
  const [pay, setPay] = useState({}); // personId -> { wage (paise a day), cycle } (owner only)
  const [wageDraft, setWageDraft] = useState({});
  const [showHist, setShowHist] = useState({}); // person key -> history expanded
  const [settle, setSettle] = useState(null); // { p, sum, cut, via }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    try {
      const docs = await fetchAllPaged(`shops/${shopId}/staffCash`);
      setEntries(docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      if (isAdmin) {
        const sal = await getDocs(query(collection(db, `shops/${shopId}/staffPeople`), limit(100)));
        setPay(Object.fromEntries(sal.docs.map((d) => [d.id, { wage: d.data().wage || 0, cycle: d.data().cycle || 'day' }])));
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
        if (editing.kind === 'advance' || editing.kind === 'debt') patch.monthly = monthly;
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

  const saveWage = async (p) => {
    const cur = pay[personId(p.name)] || { wage: 0, cycle: 'day' };
    const d = wageDraft[p.key] || {};
    const rupees = d.wage !== undefined ? parseFloat(d.wage) : cur.wage / 100;
    if (!Number.isFinite(rupees) || rupees < 0) { toast.error('Enter a valid daily wage.'); return; }
    try {
      await setDoc(doc(db, `shops/${shopId}/staffPeople`, personId(p.name)), { staff: p.name, wage: Math.round(rupees * 100), cycle: d.cycle || cur.cycle, updatedAt: serverTimestamp() });
      toast.success('Saved');
      setWageDraft((x) => { const n = { ...x }; delete n[p.key]; return n; });
      await load();
    } catch (err) { toast.error(`Could not save (${err?.code || 'error'}).`); }
  };

  const markDay = async (p, units) => {
    const wage = pay[personId(p.name)]?.wage || 0;
    if (!wage) { toast.error('Set the daily wage first.'); return; }
    if (!navigator.onLine) { toast.error('You are offline. Nothing was saved.'); return; }
    try {
      await setDoc(doc(collection(db, `shops/${shopId}/staffCash`)), { staff: p.name, kind: 'work', units, amount: Math.round(wage * units), note: '', creatorId: user.uid, createdAt: serverTimestamp() });
      toast.success(units === 1 ? 'Marked present' : 'Marked half day');
      await load();
    } catch (err) { toast.error(`Could not save (${err?.code || 'error'}).`); }
  };

  const openSettle = (p) => {
    const sum = periodSummary(p.entries);
    setSettle({ p, sum, cut: String(Math.min(Math.max(0, sum.owed), sum.due) / 100), via: 'cash' });
  };

  const doSettle = async () => {
    if (saving || !settle) return;
    if (!navigator.onLine) { toast.error('You are offline. Nothing was saved.'); return; }
    const { p, sum } = settle;
    const cut = Math.min(Math.round((parseFloat(settle.cut) || 0) * 100), sum.due, Math.max(0, sum.owed));
    const net = sum.due - cut;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const col = collection(db, `shops/${shopId}/staffCash`);
      const base = { staff: p.name, creatorId: user.uid, createdAt: serverTimestamp() };
      if (cut > 0) batch.set(doc(col), { ...base, kind: 'repay', via: 'salary', amount: cut, note: 'Cut at settle up' });
      if (net > 0) batch.set(doc(col), { ...base, kind: 'payout', via: settle.via, amount: net, note: '' });
      batch.set(doc(col), { ...base, kind: 'close', amount: sum.earned, note: `${sum.days} day(s)` });
      logActivity(batch, shopId, user.uid, { action: 'staff_settle', amount: net, note: `${p.name}: ${sum.days} day(s), cut ${formatCurrency(cut)}` });
      await batch.commit();
      toast.success('Settled up');
      setSettle(null);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(`Could not settle (${err?.code || 'error'}).`);
    } finally { setSaving(false); }
  };

  const closeLoan = async (p, e, left) => {
    if (!(await confirm({ title: 'Close this loan?', message: `${p.name} still owes ${formatCurrency(left)} on this. Closing writes it off: it will no longer count as owed and no cash comes back.`, confirmText: 'Close loan', danger: true }))) return;
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, `shops/${shopId}/staffCash`)), { staff: p.name, kind: 'repay', via: 'waive', amount: left, note: 'Loan closed', creatorId: user.uid, createdAt: serverTimestamp() });
      logActivity(batch, shopId, user.uid, { action: 'staff_loan_close', amount: left, note: `${p.name}: ${KIND_LABEL[e.kind]} ${formatCurrency(e.amount)}` });
      await batch.commit();
      toast.success('Loan closed');
      await load();
    } catch (err) { toast.error(`Could not close (${err?.code || 'error'}).`); }
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
                  const cur = pay[personId(p.name)] || { wage: 0, cycle: 'day' };
                  const d = wageDraft[p.key];
                  const sum = periodSummary(p.entries);
                  const cycleLabel = CYCLES.find(([v]) => v === cur.cycle)?.[1] || 'Daily';
                  const cutNow = Math.min(Math.max(0, sum.owed), sum.due);
                  return (
                    <div className="space-y-3 p-4">
                      {d ? (
                        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
                            <input className={cn(field, 'pl-7 h-11 font-bold')} type="number" inputMode="decimal" placeholder="Wage per day" value={d.wage ?? ''}
                              onChange={(e) => setWageDraft((x) => ({ ...x, [p.key]: { ...x[p.key], wage: e.target.value.slice(0, 9) } }))} />
                          </div>
                          <div className="flex rounded-xl bg-slate-200 p-1" role="group" aria-label="Paid">
                            {CYCLES.map(([v, l]) => (
                              <button key={v} type="button" onClick={() => setWageDraft((x) => ({ ...x, [p.key]: { ...x[p.key], cycle: v } }))}
                                className={cn('flex-1 rounded-lg py-2 text-xs font-bold', (d.cycle || cur.cycle) === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>{l}</button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setWageDraft((x) => { const n = { ...x }; delete n[p.key]; return n; })} className="h-10 flex-1 rounded-xl bg-slate-200 text-sm font-bold text-slate-700">Cancel</button>
                            <button type="button" onClick={() => saveWage(p)} className="h-10 flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white">Save</button>
                          </div>
                        </div>
                      ) : (
                        <p className="flex items-center justify-between text-sm text-slate-600">
                          <span>{cur.wage ? `${formatCurrency(cur.wage)} a day · ${cycleLabel}` : 'No wage set'}</span>
                          <button type="button" onClick={() => setWageDraft((x) => ({ ...x, [p.key]: { wage: cur.wage ? String(cur.wage / 100) : '', cycle: cur.cycle } }))} className="font-bold text-blue-600">{cur.wage ? 'Change' : 'Set wage'}</button>
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button type="button" disabled={sum.todayMarked} onClick={() => markDay(p, 1)} className="h-11 flex-1 rounded-xl bg-green-600 text-sm font-bold text-white disabled:opacity-40">{sum.todayMarked ? 'Marked today' : 'Present'}</button>
                        {!sum.todayMarked && <button type="button" onClick={() => markDay(p, 0.5)} className="h-11 flex-1 rounded-xl bg-amber-100 text-sm font-bold text-amber-800">Half day</button>}
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Due to {p.name}</p>
                        <p className="text-3xl font-black tabular-nums text-slate-900">{formatCurrency(Math.max(0, sum.due - cutNow))}</p>
                        <p className="mt-1 text-xs text-slate-500">{sum.days} day(s) · earned {formatCurrency(sum.earned)}{sum.paid > 0 ? ` · paid ${formatCurrency(sum.paid)}` : ''}{cutNow > 0 ? ` · loan cut ${formatCurrency(cutNow)}` : ''}</p>
                      </div>
                      <button type="button" disabled={sum.days === 0 && sum.earned === 0} onClick={() => openSettle(p)} className="h-12 w-full rounded-xl bg-slate-900 font-bold text-white disabled:opacity-40">Pay and close</button>
                    </div>
                  );
                })()}
                <button type="button" onClick={() => setShowHist((h) => ({ ...h, [p.key]: !h[p.key] }))} className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
                  <span>History ({p.entries.length})</span>
                  <ChevronDown size={16} className={cn('transition-transform', showHist[p.key] && 'rotate-180')} />
                </button>
                {showHist[p.key] && (() => { const since = periodSummary(p.entries).since; const loans = loanStatus(p.entries); return groupByMonth(p.entries).map((g) => (
                  <div key={g.label}>
                    <p className="bg-slate-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{g.label}</p>
                    <div className="divide-y divide-slate-50">
                      {g.items.map((e) => {
                        const at = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
                        const loan = loans.get(e.id);
                        const closed = e.kind !== 'close' && ((since && at <= since && e.kind !== 'advance' && e.kind !== 'debt') || loan?.closed);
                        const left = loan && !loan.closed ? loan.left : 0;
                        return (
                          <div key={e.id} className="flex items-center gap-2 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-sm font-semibold', closed ? 'text-slate-400 line-through' : 'text-slate-900')}>
                                {closed && <span className="mr-1 inline-block rounded bg-green-50 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-green-700 no-underline">Closed</span>}
                                {KIND_LABEL[e.kind]}{e.kind === 'repay' ? (e.via === 'salary' ? ' (from salary)' : e.via === 'waive' ? ' (loan closed)' : ' (cash)') : ''}{e.kind === 'payout' ? ` (${e.via === 'upi' ? 'UPI' : 'cash'})` : ''}{e.kind === 'work' ? (e.units === 0.5 ? ' half day' : ' full day') : ''}{e.kind === 'close' ? '' : ` · ${formatCurrency(e.amount)}`}
                              </p>
                              <p className="text-xs text-slate-500">{at.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · by {nameOf(e.creatorId)}{e.monthly ? ` · ${formatCurrency(e.monthly)}/month` : ''}{e.note ? ` · ${e.note}` : ''}</p>
                              {isAdmin && left > 0 && <button type="button" onClick={() => closeLoan(p, e, left)} className="mt-1 text-xs font-bold text-blue-600">Close loan ({formatCurrency(left)} left)</button>}
                            </div>
                            {isAdmin && e.kind !== 'close' && <button type="button" aria-label="Edit entry" onClick={() => openEdit(e)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Pencil size={16} /></button>}
                            {isAdmin && <button type="button" aria-label="Delete entry" onClick={() => remove(e)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-red-600"><Trash2 size={16} /></button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )); })()}
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
              {f.kind !== 'repay' && (!editing || editing.kind === 'advance' || editing.kind === 'debt') && (
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

      <Drawer.Root handleOnly repositionInputs={false} open={!!settle} onOpenChange={(o) => !saving && !o && setSettle(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} className="bg-white flex flex-col rounded-t-[20px] mt-24 max-h-[85vh] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <Drawer.Title className="font-bold text-slate-900 text-xl">Pay and close {settle?.p.name}</Drawer.Title>
              <button type="button" aria-label="Close" onClick={() => !saving && setSettle(null)} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500">✕</button>
            </div>
            <Drawer.Description className="sr-only">Pay the wage for this period and cut any loan</Drawer.Description>
            {settle && (() => {
              const { sum } = settle;
              const cut = Math.min(Math.round((parseFloat(settle.cut) || 0) * 100), sum.due, Math.max(0, sum.owed));
              return (
                <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-4">
                  <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700 space-y-1">
                    <p className="flex justify-between"><span>{sum.days} day(s) worked</span><b>{formatCurrency(sum.earned)}</b></p>
                    {sum.paid > 0 && <p className="flex justify-between"><span>Already paid</span><b>- {formatCurrency(sum.paid)}</b></p>}
                    {sum.cut > 0 && <p className="flex justify-between"><span>Already cut</span><b>- {formatCurrency(sum.cut)}</b></p>}
                    <p className="flex justify-between"><span>Cut for loan now</span><b>- {formatCurrency(cut)}</b></p>
                    <p className="flex justify-between border-t border-slate-100 pt-1 text-base"><span className="font-bold">Pay now</span><b>{formatCurrency(sum.due - cut)}</b></p>
                  </div>
                  {sum.owed > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Cut for loan (owes {formatCurrency(sum.owed)})</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
                        <input className={cn(field, 'pl-8 font-bold')} type="number" inputMode="decimal" value={settle.cut} onChange={(e) => setSettle((x) => ({ ...x, cut: e.target.value.slice(0, 9) }))} />
                      </div>
                    </div>
                  )}
                  <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Paid by">
                    {[['cash', 'Cash from drawer'], ['upi', 'UPI']].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setSettle((x) => ({ ...x, via: v }))} className={cn('flex-1 rounded-lg py-2.5 text-xs font-bold', settle.via === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>{l}</button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-slate-500">After this, the days above show as Closed and a new period starts. Any loan left carries over.</p>
                </div>
              );
            })()}
            <div className="absolute bottom-0 left-0 right-0 border-t border-slate-100 bg-white p-4 pb-safe">
              <button type="button" disabled={saving} onClick={doSettle} className="h-14 w-full rounded-xl bg-slate-900 font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Confirm and close'}</button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
