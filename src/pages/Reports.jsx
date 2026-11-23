import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { ChevronLeft, Download } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { costFields } from '../lib/costs';
import { useCostStore } from '../store/costStore';
import { useCostsLoader } from '../hooks/useCostsLoader';
import { useCatalogStore } from '../store/catalogStore';
import { useNameOf } from '../lib/memberNames';
import { bizDate, bizDayStart, dayKey } from '../lib/statsMath';
import { rankItems, deadStock, returnsByProduct, summarize, billDate } from '../lib/reports';
import { rs, buildReport } from '../lib/reportExport';
import { saveFile } from '../lib/shareFile';
import { formatCurrency, cn } from '../lib/utils';
import { subDays, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import BottomNav from '../components/BottomNav';
import { ListSkeleton } from '../components/Skeleton';

const PAGE = 100;
const MAX_BILLS = 1500; // 15 reads of 100: keeps cost small; the screen says when the period is cut

const PERIODS = [
  ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'],
];
function periodRange(p) {
  const today = bizDate();
  if (p === '7d') return { from: subDays(today, 6), to: today, label: 'Last 7 days' };
  if (p === '30d') return { from: subDays(today, 29), to: today, label: 'Last 30 days' };
  if (p === 'lastmonth') { const m = subMonths(today, 1); return { from: startOfMonth(m), to: endOfMonth(m), label: format(m, 'MMMM yyyy') }; }
  return { from: startOfMonth(today), to: today, label: format(today, 'MMMM yyyy') };
}

const TABS = [['best', 'Best sellers'], ['slow', 'Not selling'], ['stock', 'Stock'], ['staff', 'Staff'], ['returns', 'Returns']];
const BY = [['product', 'Product'], ['colour', 'Colour'], ['size', 'Size']];

const Chip = ({ on, children, ...p }) => (
  <button type="button" {...p} className={cn('press shrink-0 rounded-full px-4 py-2 text-sm font-bold', on ? 'bg-blue-600 text-white' : 'glass-btn-flat text-slate-700')}>{children}</button>
);
const Row = ({ left, sub, right }) => (
  <div className="glass-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
    <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{left}</p>{sub && <p className="truncate text-xs text-slate-500">{sub}</p>}</div>
    <p className="shrink-0 text-sm font-black tabular-nums text-slate-900">{right}</p>
  </div>
);

/** Owner and staff reports. All of them can be saved as a PDF. */
export default function Reports() {
  const { shopId, shopName, user, shopAdminId } = useAuth();
  const isAdmin = user?.uid === shopAdminId;
  useCostsLoader(shopId, isAdmin);
  const costMap = useCostStore((s) => s.costs);
  const navigate = useNavigate();
  const nameOf = useNameOf(shopId, user?.uid);
  const catalog = useCatalogStore((s) => s.items);
  const [period, setPeriod] = useState('30d');
  const [tab, setTab] = useState('best');
  const [by, setBy] = useState('product');
  const [bills, setBills] = useState(null);
  const [cut, setCut] = useState(false);
  const [error, setError] = useState('');
  const range = useMemo(() => periodRange(period), [period]);

  const load = useCallback(async () => {
    if (!shopId) return;
    setBills(null); setError(''); setCut(false);
    try {
      const start = bizDayStart(new Date(`${dayKey(range.from)}T00:00:00`));
      const endD = new Date(`${dayKey(range.to)}T00:00:00`); endD.setDate(endD.getDate() + 1);
      const end = bizDayStart(endD);
      const all = [];
      let last = null;
      for (;;) {
        const q = query(collection(db, `shops/${shopId}/bills`), where('createdAt', '>=', start), where('createdAt', '<', end), orderBy('createdAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(PAGE));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => all.push({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        if (snap.size < PAGE) break;
        last = snap.docs[snap.docs.length - 1];
        if (all.length >= MAX_BILLS) { setCut(true); break; }
      }
      setBills(all);
    } catch (e) { console.error(e); setError(e.code || 'error'); setBills([]); }
  }, [shopId, range]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const sum = useMemo(() => summarize(bills || []), [bills]);
  const best = useMemo(() => rankItems(bills || [], catalog, by, 30), [bills, catalog, by]);
  const slow = useMemo(() => deadStock(catalog, bills || [], 50), [catalog, bills]);
  const returns = useMemo(() => returnsByProduct(bills || [], 30), [bills]);
  const stock = useMemo(() => (catalog || []).filter((c) => c.id && c.isActive !== false && !c.deleted && typeof c.stockCount === 'number')
    .map((c) => ({ name: c.name, qty: c.stockCount, cost: Number(costFields(c, isAdmin ? costMap : null).costPrice) || 0, price: Number(c.lastUsedPrice) || 0, low: c.lowStockAlert != null && c.stockCount <= c.lowStockAlert }))
    .sort((a, b) => a.name.localeCompare(b.name)), [catalog, costMap, isAdmin]);
  const staff = useMemo(() => {
    const m = new Map();
    (bills || []).filter((b) => (b.type || 'sale') === 'sale').forEach((b) => {
      const r = m.get(b.creatorId) || { uid: b.creatorId, bills: 0, revenue: 0 };
      r.bills += 1; r.revenue += Number(b.grandTotal) || 0; m.set(b.creatorId, r);
    });
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [bills]);

  const stockValue = stock.reduce((n, r) => ({ cost: n.cost + r.qty * r.cost, price: n.price + r.qty * r.price, units: n.units + r.qty }), { cost: 0, price: 0, units: 0 });

  const spec = () => {
    const sub = `${range.label}${cut ? ' (first 1500 bills)' : ''}`;
    const t = (n) => `${shopName || 'Shop'} - ${n}`;
    if (tab === 'best') return { title: t('Best sellers'), subtitle: `${sub} · by ${by}`, kpis: [{ label: 'Bills', value: String(sum.bills) }, { label: 'Sales', value: rs(sum.revenue) }, { label: 'Average bill', value: rs(sum.avgBill) }], columns: [{ label: by[0].toUpperCase() + by.slice(1), w: 5 }, { label: 'Pairs', w: 1.3, align: 'right' }, { label: 'Sales', w: 2.2, align: 'right' }], rows: best.map((r) => [r.label, String(r.qty), rs(r.revenue)]) };
    if (tab === 'slow') return { title: t('Not selling'), subtitle: `${sub} · in stock but no sale`, columns: [{ label: 'Product', w: 5 }, { label: 'In stock', w: 1.5, align: 'right' }, { label: 'Value', w: 2.2, align: 'right' }], rows: slow.map((r) => [r.name, String(r.stock), rs(r.value)]) };
    if (tab === 'stock') return { title: t('Stock'), subtitle: `As of ${format(new Date(), 'd MMM yyyy')}`, kpis: [{ label: 'Pairs in stock', value: String(stockValue.units) }, { label: 'Value at cost', value: rs(stockValue.cost) }, { label: 'Value at selling price', value: rs(stockValue.price) }], columns: [{ label: 'Product', w: 5 }, { label: 'Qty', w: 1.2, align: 'right' }, { label: 'Selling price', w: 2.2, align: 'right' }], rows: stock.map((r) => [r.low ? `${r.name} (low)` : r.name, String(r.qty), rs(r.price)]), notes: ['Value at cost uses the cost price you entered; products without a cost price count as 0.'] };
    if (tab === 'staff') return { title: t('Staff'), subtitle: sub, columns: [{ label: 'Person', w: 4 }, { label: 'Bills', w: 1.3, align: 'right' }, { label: 'Sales', w: 2.4, align: 'right' }], rows: staff.map((r) => [nameOf(r.uid), String(r.bills), rs(r.revenue)]) };
    return { title: t('Returns'), subtitle: `${sub} · returned items`, kpis: [{ label: 'Returned', value: rs(sum.returned) }, { label: 'Return rate', value: `${(sum.returnRate * 100).toFixed(1)}%` }], columns: [{ label: 'Product', w: 5 }, { label: 'Returned', w: 1.5, align: 'right' }, { label: 'Sold', w: 1.3, align: 'right' }], rows: returns.map((r) => [r.label, String(r.qty), String(r.sold)]) };
  };
  const exportPdf = async () => {
    try { const blob = await buildReport('pdf', spec()); await saveFile(blob, `ledgro-${tab}-${dayKey(new Date())}.pdf`, 'Save report'); }
    catch (e) { console.error(e); toast.error('Could not make the PDF.'); }
  };

  const loading = bills === null && tab !== 'stock';
  const none = <p className="py-8 text-center text-sm font-semibold text-slate-500">Nothing to show for this period.</p>;
  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50 pb-nav">
      <header className="sticky top-0 z-30 glass-header flex items-center gap-3 px-4 py-4">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-1 p-1 text-slate-500"><ChevronLeft size={24} /></button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Reports</h1>
        <button type="button" onClick={exportPdf} disabled={loading} className="glass-btn press flex h-10 items-center gap-2 px-4 text-sm font-bold disabled:opacity-50"><Download size={16} aria-hidden="true" />PDF</button>
      </header>
      <main className="space-y-4 p-4">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">{TABS.map(([k, l]) => <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{l}</Chip>)}</div>
        {tab !== 'stock' && <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">{PERIODS.map(([k, l]) => <Chip key={k} on={period === k} onClick={() => setPeriod(k)}>{l}</Chip>)}</div>}
        {tab === 'best' && <div className="flex gap-2">{BY.map(([k, l]) => <Chip key={k} on={by === k} onClick={() => setBy(k)}>{l}</Chip>)}</div>}
        {cut && tab !== 'stock' && <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-700">This period has more than 1500 bills, so only the latest 1500 are counted. Pick a shorter period for exact numbers.</p>}
        {error && <p className="text-sm font-semibold text-red-600">Could not load bills ({error}).</p>}
        {loading ? <ListSkeleton /> : (
          <div className="space-y-2">
            {tab === 'best' && (best.length ? best.map((r, i) => <Row key={r.label} left={`${i + 1}. ${r.label}`} sub={`${r.qty} pairs`} right={formatCurrency(r.revenue)} />) : none)}
            {tab === 'slow' && (slow.length ? slow.map((r) => <Row key={r.id} left={r.name} sub={`${r.stock} in stock, none sold`} right={formatCurrency(r.value)} />) : <p className="py-8 text-center text-sm font-semibold text-slate-500">Everything in stock sold at least once in this period.</p>)}
            {tab === 'stock' && (
              <>
                <div className="glass-card rounded-2xl p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock value</p>
                  <p className="text-2xl font-black text-slate-900">{formatCurrency(stockValue.price)}</p>
                  <p className="text-xs font-semibold text-slate-500">{stockValue.units} pairs · cost {formatCurrency(stockValue.cost)}</p></div>
                {stock.length ? stock.map((r) => <Row key={r.name} left={r.name} sub={r.low ? 'Low stock' : undefined} right={`${r.qty}`} />) : none}
              </>
            )}
            {tab === 'staff' && (staff.length ? staff.map((r) => <Row key={r.uid} left={nameOf(r.uid)} sub={`${r.bills} bills`} right={formatCurrency(r.revenue)} />) : none)}
            {tab === 'returns' && (returns.length ? returns.map((r) => <Row key={r.label} left={r.label} sub={`${r.sold} sold`} right={`${r.qty} back`} />) : none)}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
