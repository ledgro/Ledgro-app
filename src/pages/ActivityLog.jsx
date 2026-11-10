import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { ChevronLeft } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useNameOf } from '../lib/memberNames';
import { formatCurrency } from '../lib/utils';
import BottomNav from '../components/BottomNav';
import { ListSkeleton } from '../components/Skeleton';
import { useShowLoader } from '../hooks/useShowLoader';

const LABELS = { void: 'Voided bill', payment_change: 'Payment changed', return: 'Return', discount: 'Discount given', expense_delete: 'Expense deleted', import: 'Products imported', staff_edit: 'Staff entry edited', staff_delete: 'Staff entry deleted', staff_settle: 'Staff settled up', staff_loan_close: 'Staff loan closed' };

/** Owner only: who voided, changed, discounted or deleted what. Entries cannot be edited. */
export default function ActivityLog() {
  const { user, shopId, shopAdminId } = useAuth();
  const nameOf = useNameOf(shopId, user?.uid);
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const isOwner = user?.uid === shopAdminId;
  const showLoader = useShowLoader(rows === null && !error);

  useEffect(() => {
    if (!shopId || !isOwner) return;
    getDocs(query(collection(db, `shops/${shopId}/auditLogs`), orderBy('createdAt', 'desc'), limit(100)))
      .then((snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))))
      .catch((e) => setError(e.code || 'error'));
  }, [shopId, isOwner]);

  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 glass-header px-4 py-4 flex items-center gap-3">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="p-1 -ml-1 text-slate-500"><ChevronLeft size={24} /></button>
        <h1 className="text-xl font-bold text-slate-900">Activity log</h1>
      </header>
      <main className="p-4 space-y-2">
        {!isOwner ? <p className="text-sm text-slate-500">Only the owner can see this.</p>
          : error ? <p className="text-sm text-red-600">Could not load ({error}).</p>
          : rows === null ? (showLoader ? <ListSkeleton /> : null)
          : rows.length === 0 ? <p className="text-sm text-slate-500">Nothing recorded yet.</p>
          : rows.map((r) => (
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
      </main>
      <BottomNav />
    </div>
  );
}
