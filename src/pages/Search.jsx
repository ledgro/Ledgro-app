import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { ChevronLeft, Search as SearchIcon, X, Package, FileText, Receipt } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { useCatalogLoader } from '../hooks/useCatalogLoader';
import { formatCurrency } from '../lib/utils';

const toDate = (ts) => (ts?.toDate ? ts.toDate() : null);
const fmt = (d) => (d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const MAX = 6;

function Group({ title, Icon, children, count }) {
  if (!count) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Icon size={14} aria-hidden="true" /> {title}</h2>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-sm">{children}</ul>
    </section>
  );
}

export default function Search() {
  const { shopId } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [term, setTerm] = useState('');
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [exact, setExact] = useState([]);

  useCatalogLoader(shopId);
  const items = useCatalogStore((s) => s.items);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Firestore has no text search, so bills and expenses are matched in the browser over the latest 100 of each.
  useEffect(() => {
    if (!shopId) return undefined;
    let off = false;
    const q = (n) => getDocs(query(collection(db, `shops/${shopId}/${n}`), orderBy('createdAt', 'desc'), limit(100)));
    Promise.all([q('bills'), q('expenses')])
      .then(([b, e]) => {
        if (off) return;
        setBills(b.docs.map((d) => ({ id: d.id, ...d.data() })));
        setExpenses(e.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {});
    return () => { off = true; };
  }, [shopId]);

  // An older bill can still be found by typing its full number.
  useEffect(() => {
    const t = term.trim();
    if (!shopId || t.length < 5 || !/[0-9]/.test(t)) { setExact([]); return undefined; }
    let off = false;
    getDocs(query(collection(db, `shops/${shopId}/bills`), where('billNo', '==', t), limit(3)))
      .then((s) => { if (!off) setExact(s.docs.map((d) => ({ id: d.id, ...d.data() }))); })
      .catch(() => { if (!off) setExact([]); });
    return () => { off = true; };
  }, [term, shopId]);

  const t = term.trim().toLowerCase();
  const prods = useMemo(() => {
    if (!t) return [];
    return items
      .filter((i) => i.id && i.isActive !== false && [i.name, i.sku, i.barcode, i.category].some((v) => v && String(v).toLowerCase().includes(t)))
      .slice(0, MAX);
  }, [items, t]);
  const billHits = useMemo(() => {
    const seen = new Set();
    const hit = [...exact, ...bills.filter((b) => t && String(b.billNo || '').toLowerCase().includes(t))]
      .filter((b) => (seen.has(b.id) ? false : seen.add(b.id)));
    return t ? hit.slice(0, MAX) : bills.filter((b) => b.type !== 'reversal').slice(0, 5);
  }, [bills, exact, t]);
  const expHits = useMemo(() => {
    if (!t) return [];
    return expenses.filter((e) => [e.description, e.category].some((v) => v && String(v).toLowerCase().includes(t))).slice(0, MAX);
  }, [expenses, t]);

  const none = t && !prods.length && !billHits.length && !expHits.length;

  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50">
      <header className="sticky top-0 z-30 flex items-center gap-2 px-4 py-3 bg-slate-50">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="glass-btn"><ChevronLeft size={20} /></button>
        <div className="relative flex-1">
          <SearchIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input maxLength={60}
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search products, bills, expenses"
            aria-label="Search"
            enterKeyHint="search"
            className="h-11 w-full rounded-full border border-slate-200 bg-white pl-10 pr-10 text-sm font-semibold"
          />
          {term && (
            <button type="button" aria-label="Clear" onClick={() => { setTerm(''); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500"><X size={16} /></button>
          )}
        </div>
      </header>

      <main className="space-y-5 p-4 pb-12">
        {!t && <p className="text-sm text-slate-500">Type a product name, SKU, barcode, bill number or expense. Latest bills are below.</p>}
        <Group title="Products" Icon={Package} count={prods.length}>
          {prods.map((p) => (
            <li key={p.id}>
              <Link to={`/products?q=${encodeURIComponent(p.name)}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">{p.stockCount != null ? `${p.stockCount} in stock` : 'No stock tracking'}</span></span>
                <span className="flex-shrink-0 text-sm font-black tabular-nums text-slate-900">{formatCurrency(p.price)}</span>
              </Link>
            </li>
          ))}
        </Group>
        <Group title={t ? 'Bills' : 'Latest bills'} Icon={FileText} count={billHits.length}>
          {billHits.map((b) => (
            <li key={b.id}>
              <Link to={`/ledger?q=${encodeURIComponent(b.billNo || '')}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{b.type === 'return' ? 'Return' : 'Bill'} {b.billNo || ''}</span>
                  <span className="block truncate text-xs text-slate-500">{fmt(toDate(b.createdAt))}{b.paymentMethod ? ` · ${String(b.paymentMethod).toUpperCase()}` : ''}</span></span>
                <span className={`flex-shrink-0 text-sm font-black tabular-nums ${b.type === 'return' ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(b.grandTotal || 0)}</span>
              </Link>
            </li>
          ))}
        </Group>
        <Group title="Expenses" Icon={Receipt} count={expHits.length}>
          {expHits.map((e) => (
            <li key={e.id}>
              <Link to="/expenses" className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{e.description || e.category}</span>
                  <span className="block truncate text-xs text-slate-500">{fmt(toDate(e.createdAt))} · {e.category}</span></span>
                <span className="flex-shrink-0 text-sm font-black tabular-nums text-red-600">-{formatCurrency(e.amount || 0)}</span>
              </Link>
            </li>
          ))}
        </Group>
        {none && <p className="py-10 text-center text-sm font-semibold text-slate-500">Nothing found for "{term.trim()}". Bills and expenses search the latest 100; type a full bill number for older ones.</p>}
      </main>
    </div>
  );
}
