import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { FilePlus2, Package, Receipt, PackagePlus, AlertCircle, ChevronRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { db } from '../firebase';
import { useCatalogStore } from '../store/catalogStore';
import { useCatalogLoader } from '../hooks/useCatalogLoader';
import { formatCurrency } from '../lib/utils';

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null);

const ACTIONS = [
  { to: '/pos', label: 'New bill', Icon: FilePlus2 },
  { to: '/products', label: 'Products', Icon: Package },
  { to: '/expenses', label: 'Expenses', Icon: Receipt },
  { to: '/transfers', label: 'Stock in', Icon: PackagePlus },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Quick actions">
      {ACTIONS.map(({ to, label, Icon }) => (
        <Link key={to} to={to} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
          <span className="glass-card flex h-16 w-16 items-center justify-center rounded-2xl text-blue-600">
            <Icon size={24} aria-hidden="true" />
          </span>
          <span className="text-xs font-bold text-slate-700">{label}</span>
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
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
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

export function LatestActivity({ shopId, mask }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    const q = (name) => getDocs(query(collection(db, `shops/${shopId}/${name}`), orderBy('createdAt', 'desc'), limit(15)));
    Promise.all([q('bills'), q('expenses')])
      .then(([bs, es]) => {
        if (cancelled) return;
        const bills = bs.docs.map((d) => ({ id: d.id, ...d.data() }));
        const reversed = new Set(bills.filter((b) => b.type === 'reversal' && b.originalBillId).map((b) => b.originalBillId));
        const list = [
          ...bills.filter((b) => b.type !== 'reversal' && !reversed.has(b.id)).map((b) => ({
            id: `b${b.id}`, at: toDate(b.createdAt), amount: b.grandTotal || 0, out: b.type === 'return',
            title: b.type === 'return' ? 'Return' : `Bill${b.billNo ? ` ${b.billNo}` : ''}`, sub: (b.paymentMethod || '').toUpperCase(),
          })),
          ...es.docs.map((d) => { const e = d.data(); return { id: `e${d.id}`, at: toDate(e.createdAt), amount: e.amount || 0, out: true, title: e.description || e.category || 'Expense', sub: e.category || '' }; }),
        ];
        list.sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
        setRows(list.slice(0, 10));
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [shopId]);

  if (!rows) return null;
  return (
    <section aria-label="Latest transactions">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-black text-slate-900">Latest transactions</h3>
        <Link to="/ledger" className="flex items-center text-xs font-semibold text-blue-600">View all <ChevronRight size={14} aria-hidden="true" /></Link>
      </div>
      {rows.length === 0 && <p className="glass-card rounded-2xl px-4 py-6 text-center text-sm text-slate-500">No bills or expenses yet. Tap + to make your first bill.</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3">
            <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${r.out ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {r.out ? <ArrowUpRight size={18} aria-hidden="true" /> : <ArrowDownLeft size={18} aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900">{r.title}</span>
              <span className="block truncate text-xs text-slate-500">
                {r.at ? r.at.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}{r.sub ? ` · ${r.sub}` : ''}
              </span>
            </span>
            <span className={`flex-shrink-0 text-sm font-black tabular-nums ${r.out ? 'text-red-600' : 'text-emerald-600'}`}>
              {r.out ? '-' : '+'}{mask(formatCurrency(r.amount))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
