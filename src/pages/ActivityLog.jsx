import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, startAfter } from 'firebase/firestore';
import { ChevronLeft, Download, Search as SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { rs, buildReport } from '../lib/reportExport';
import { saveFile } from '../lib/shareFile';
import { cn } from '../lib/utils';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useNameOf } from '../lib/memberNames';
import { formatCurrency } from '../lib/utils';
import BottomNav from '../components/BottomNav';
import { ListSkeleton } from '../components/Skeleton';
import { useShowLoader } from '../hooks/useShowLoader';

const PAGE = 50;
const LABELS = { void: 'Voided bill', payment_change: 'Payment changed', return: 'Return', discount: 'Discount given', expense_delete: 'Expense deleted', expense_paid: 'Expense marked paid', import: 'Products imported', staff_edit: 'Staff entry edited', staff_delete: 'Staff entry deleted', staff_settle: 'Staff settled up', staff_loan_close: 'Staff loan closed', price_change: 'Price changed', stock_change: 'Stock changed' };

/** Owner only: who voided, changed, discounted or deleted what. Entries cannot be edited. */
export default function ActivityLog() {
  const { user, shopId, shopAdminId } = useAuth();
  const nameOf = useNameOf(shopId, user?.uid);
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fAction, setFAction] = useState('');
  const [fWho, setFWho] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const isOwner = user?.uid === shopAdminId;
  const showLoader = useShowLoader(rows === null && !error);

  useEffect(() => {
    if (!shopId || !isOwner) return;
    getDocs(query(collection(db, `shops/${shopId}/auditLogs`), orderBy('createdAt', 'desc'), limit(PAGE)))
      .then((snap) => { setRows(snap.docs.map((d) => ({ id: d.id, _doc: d, ...d.data({ serverTimestamps: 'estimate' }) }))); setMore(snap.size === PAGE); })
      .catch((e) => setError(e.code || 'error'));
  }, [shopId, isOwner]);

  const loadMore = async () => {
    const last = rows?.[rows.length - 1]?._doc;
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(collection(db, `shops/${shopId}/auditLogs`), orderBy('createdAt', 'desc'), startAfter(last), limit(PAGE)));
      setRows((p) => [...p, ...snap.docs.map((d) => ({ id: d.id, _doc: d, ...d.data({ serverTimestamps: 'estimate' }) }))]);
      setMore(snap.size === PAGE);
    } catch (e) { toast.error('Could not load more.'); } finally { setLoadingMore(false); }
  };

  const when = (r) => (r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const actions = [...new Set((rows || []).map((r) => r.action))];
  const people = [...new Set((rows || []).map((r) => r.uid))];
  const needle = q.trim().toLowerCase();
  const shown = (rows || []).filter((r) => (!fAction || r.action === fAction) && (!fWho || r.uid === fWho)
    && (!needle || `${LABELS[r.action] || r.action} ${r.billNo || ''} ${r.note || ''} ${nameOf(r.uid)}`.toLowerCase().includes(needle)));

  const exportPdf = async () => {
    try {
      const blob = await buildReport('pdf', {
        title: 'Activity log', subtitle: `${shown.length} entries${fAction || fWho || needle ? ' (filtered)' : ''}`,
        columns: [{ label: 'When', w: 2.2 }, { label: 'Who', w: 1.8 }, { label: 'What', w: 2.6 }, { label: 'Amount', w: 1.6, align: 'right' }, { label: 'Details', w: 4.5 }],
        rows: shown.map((r) => [when(r), nameOf(r.uid), LABELS[r.action] || r.action, r.amount > 0 ? rs(r.amount) : '', `${r.billNo ? `${r.billNo} ` : ''}${r.note || ''}`.trim()]),
      });
      await saveFile(blob, `ledgro-activity-${new Date().toISOString().slice(0, 10)}.pdf`, 'Save activity log');
    } catch (e) { console.error(e); toast.error('Could not make the PDF.'); }
  };

  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 glass-header px-4 py-4 flex items-center gap-3">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="p-1 -ml-1 text-slate-500"><ChevronLeft size={24} /></button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Activity log</h1>
        {isOwner && rows?.length > 0 && <button type="button" onClick={exportPdf} className="glass-btn press flex h-10 items-center gap-2 px-4 text-sm font-bold"><Download size={16} aria-hidden="true" />PDF</button>}
      </header>
      <main className="p-4 space-y-2">
        {!isOwner ? <p className="text-sm text-slate-500">Only the owner can see this.</p>
          : error ? <p className="text-sm text-red-600">Could not load ({error}).</p>
          : rows === null ? (showLoader ? <ListSkeleton /> : null)
          : rows.length === 0 ? <p className="text-sm text-slate-500">Nothing recorded yet.</p>
          : (
            <>
              <div className="relative">
                <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={40} placeholder="Search bill number, product, person" aria-label="Search activity" className="glass-input h-11 w-full rounded-full pl-10 pr-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {[['', 'All'], ...actions.map((a) => [a, LABELS[a] || a])].map(([k, l]) => (
                  <button key={k || 'all'} type="button" onClick={() => setFAction(k)} className={cn('press h-9 shrink-0 rounded-full px-4 text-sm font-bold', fAction === k ? 'bg-blue-600 text-white' : 'glass-btn-flat text-slate-700')}>{l}</button>
                ))}
              </div>
              {people.length > 1 && (
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                  {[['', 'Everyone'], ...people.map((u) => [u, nameOf(u)])].map(([k, l]) => (
                    <button key={k || 'all'} type="button" onClick={() => setFWho(k)} className={cn('press h-9 shrink-0 rounded-full px-4 text-sm font-bold', fWho === k ? 'bg-slate-800 text-white' : 'glass-btn-flat text-slate-700')}>{l}</button>
                  ))}
                </div>
              )}
              {shown.length === 0 && <p className="py-6 text-center text-sm font-semibold text-slate-500">Nothing matches.</p>}
              {shown.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-900">{LABELS[r.action] || r.action}</span>
                {r.amount > 0 && <span className="font-bold text-slate-900 tabular-nums">{formatCurrency(r.amount)}</span>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {nameOf(r.uid)}{r.billNo ? ` · ${r.billNo}` : ''}{r.note ? ` · ${r.note}` : ''} · {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}
              </p>
            </div>
              ))}
              {more && <div className="py-4 text-center"><button type="button" onClick={loadMore} disabled={loadingMore} className="glass-btn press h-12 rounded-full px-8 text-sm font-bold text-blue-600 disabled:opacity-60">{loadingMore ? 'Loading...' : 'Load 50 more'}</button></div>}
            </>
          )}
      </main>
      <BottomNav />
    </div>
  );
}
