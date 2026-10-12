import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { FilePlus2, Receipt, PackagePlus, AlertCircle, ChevronRight } from 'lucide-react';
import { db } from '../firebase';
import { useCatalogStore } from '../store/catalogStore';
import { useCatalogLoader } from '../hooks/useCatalogLoader';
import { formatCurrency } from '../lib/utils';

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null);

const ACTIONS = [
  { to: '/pos', label: 'New bill', Icon: FilePlus2, tone: 'bg-blue-600 text-white' },
  { to: '/expenses', label: 'Expense', Icon: Receipt, tone: 'bg-white text-slate-800 border border-slate-200' },
  { to: '/transfers', label: 'Stock in', Icon: PackagePlus, tone: 'bg-white text-slate-800 border border-slate-200' },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-3" role="group" aria-label="Quick actions">
      {ACTIONS.map(({ to, label, Icon, tone }) => (
        <Link key={to} to={to} className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl text-sm font-bold shadow-sm active:scale-95 transition-transform ${tone}`}>
          <Icon size={22} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  );
}

export function LowStock({ shopId }) {
  useCatalogLoader(shopId);
  const items = useCatalogStore((s) => s.items);
  const low = useMemo(
    () =>
      items
        .filter((i) => i.id && i.isActive !== false && i.stockCount != null && i.lowStockAlert != null && i.stockCount <= i.lowStockAlert)
        .sort((a, b) => a.stockCount - b.stockCount),
    [items]
  );
  if (low.length === 0) return null;
  return (
    <section aria-label="Low stock" className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <AlertCircle size={14} className="text-red-500" aria-hidden="true" /> Low stock
        </h3>
        <Link to="/products" className="text-xs font-semibold text-blue-600">See all</Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {low.slice(0, 4).map((i) => (
          <li key={i.id} className="flex items-center justify-between py-2 text-sm">
            <span className="truncate pr-3 font-medium text-slate-800">{i.name}</span>
            <span className={`flex-shrink-0 font-bold ${i.stockCount <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
              {i.stockCount <= 0 ? 'Out' : `${i.stockCount} left`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecentBills({ shopId, mask }) {
  const [bills, setBills] = useState(null);
  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    getDocs(query(collection(db, `shops/${shopId}/bills`), orderBy('createdAt', 'desc'), limit(10)))
      .then((snap) => {
        if (cancelled) return;
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const reversed = new Set(all.filter((b) => b.type === 'reversal' && b.originalBillId).map((b) => b.originalBillId));
        setBills(all.filter((b) => b.type !== 'reversal' && !reversed.has(b.id)).slice(0, 3));
      })
      .catch(() => { if (!cancelled) setBills([]); });
    return () => { cancelled = true; };
  }, [shopId]);

  if (!bills || bills.length === 0) return null;
  return (
    <section aria-label="Recent bills" className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent bills</h3>
        <Link to="/ledger" className="flex items-center text-xs font-semibold text-blue-600">History <ChevronRight size={14} aria-hidden="true" /></Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {bills.map((b) => {
          const d = toDate(b.createdAt);
          return (
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-500">
                {d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}
                <span className="ml-2 text-xs uppercase text-slate-400">{b.paymentMethod || ''}</span>
              </span>
              <span className={`font-bold ${b.type === 'return' ? 'text-red-600' : 'text-slate-900'}`}>{mask(formatCurrency(b.grandTotal))}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
