import { toast } from 'sonner';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { readStatsRange } from '../lib/dayStats';
import { dayKey, bizDate, sumStats } from '../lib/statsMath';
import { rs, buildReport } from '../lib/reportExport';
import { saveFile } from '../lib/shareFile';
import BottomNav from '../components/BottomNav';
import { Download, ChevronLeft } from 'lucide-react';
import { formatCurrency, cn, sanitizeText } from '../lib/utils';
import { motion } from 'framer-motion';
import { Donut, Legend, Trend, PALETTE } from '../components/charts';
import { Skeleton } from '../components/Skeleton';

import { addDays, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { Link } from 'react-router-dom';

const Row = ({ label, value, sub, strong, tone }) => (
  <div className={cn('flex items-baseline justify-between gap-3 py-2', strong && 'border-t border-slate-200 mt-1 pt-3')}>
    <span className={cn('text-sm capitalize', strong ? 'font-bold text-slate-900' : 'text-slate-600')}>{label}</span>
    <span className="text-right">
      <span className={cn('tabular-nums', strong ? 'text-base font-black' : 'text-sm font-semibold text-slate-800', tone)}>{formatCurrency(value)}</span>
      {sub != null && <span className="block text-xs text-slate-500">{sub}</span>}
    </span>
  </div>
);

const TABS = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];

function makeBuckets(tab) {
  const today = bizDate();
  const out = [];
  if (tab === 'daily') {
    for (let i = 6; i >= 0; i--) { const d = subDays(today, i); out.push({ from: d, to: d, label: format(d, 'EEE'), full: format(d, 'MMMM d, EEE, yyyy') }); }
  } else if (tab === 'weekly') {
    for (let i = 7; i >= 0; i--) {
      const f = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const t = endOfWeek(f, { weekStartsOn: 1 });
      out.push({ from: f, to: t > today ? today : t, label: format(f, 'd MMM'), full: `${format(f, 'd MMM')} - ${format(t, 'd MMM yyyy')}` });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const f = startOfMonth(subMonths(today, i));
      const t = endOfMonth(f);
      out.push({ from: f, to: t > today ? today : t, label: format(f, 'MMM'), full: format(f, 'MMMM yyyy') });
    }
  }
  return out;
}

function keysBetween(from, to) {
  const keys = [];
  for (let d = from; d <= to; d = addDays(d, 1)) keys.push(dayKey(d));
  return keys;
}

export default function PLScreen() {
  const { shopId, shopName } = useAuth();
  const [tab, setTab] = useState('daily');
  const [days, setDays] = useState(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(-1);
  const [isExporting, setIsExporting] = useState(false);

  const buckets = useMemo(() => makeBuckets(tab), [tab]);

  useEffect(() => {
    if (!shopId) return undefined;
    let off = false;
    setDays(null); setFailed(false);
    readStatsRange(shopId, dayKey(buckets[0].from), dayKey(buckets[buckets.length - 1].to))
      .then((m) => { if (!off) setDays(m); })
      .catch((err) => { console.error(err); if (!off) { setFailed(true); setDays(new Map()); } });
    return () => { off = true; };
  }, [shopId, buckets]);

  const totals = useMemo(
    () => buckets.map((b) => sumStats(keysBetween(b.from, b.to).map((k) => days?.get(k)).filter(Boolean))),
    [buckets, days],
  );
  const idx = sel >= 0 && sel < buckets.length ? sel : buckets.length - 1;
  const cur = totals[idx];
  const bucket = buckets[idx];
  const max = Math.max(1, ...totals.map((t) => t.rev));

  const sales = cur.rev;
  const exp = cur.exp;
  const net = sales - exp;
  const margin = sales > 0 ? (net / sales) * 100 : null;
  const pct = (v) => (sales > 0 ? `${((v / sales) * 100).toFixed(1)}%` : '-');
  const cats = Object.entries(cur.cats || {}).sort((x, y) => y[1] - x[1]);
  const cash = cur.cash + cur.splitCash;
  const upi = cur.upi + cur.splitUpi;
  const loading = days == null;

  const top = cats.slice(0, 4);
  const rest = cats.slice(4).reduce((n, [, v]) => n + v, 0);
  const catSegs = [...top.map(([k, v], i) => ({ label: sanitizeText(k).replace(/_/g, ' '), value: v, color: PALETTE[i] })), ...(rest > 0 ? [{ label: 'Other', value: rest, color: PALETTE[4] }] : [])];
  const shareOf = (v) => (exp > 0 ? `${Math.round((v / exp) * 100)}%` : '-');
  const paySegs = [{ label: 'Cash', value: cash, color: '#34d399' }, { label: 'UPI', value: upi, color: '#60a5fa' }];
  const payTotal = cash + upi;
  const payShare = (v) => (payTotal > 0 ? `${Math.round((v / payTotal) * 100)}%` : '-');

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const blob = await buildReport('pdf', {
        title: `${shopName || 'Shop'} - Statistics`,
        subtitle: bucket.full,
        kpis: [
          { label: 'Money in (net sales)', value: rs(sales) },
          { label: 'Money out (expenses)', value: rs(exp) },
          { label: net >= 0 ? 'Profit' : 'Loss', value: rs(net), tone: net >= 0 ? 'good' : 'bad' },
        ],
        columns: [{ label: 'What', w: 5 }, { label: 'Amount', w: 2.2, align: 'right' }, { label: 'Share of sales', w: 1.6, align: 'right' }],
        rows: [
          { kind: 'section', cells: ['MONEY IN: sales'] },
          ['Paid in cash', rs(cash), pct(cash)],
          ['Paid by UPI', rs(upi), pct(upi)],
          { kind: 'total', cells: ['Total sales (after returns)', rs(sales), sales > 0 ? '100.0%' : '-'] },
          { kind: 'gap', cells: [] },
          { kind: 'section', cells: ['MONEY OUT: expenses'] },
          ...cats.map(([k, v]) => [String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), rs(v), pct(v)]),
          { kind: 'total', cells: ['Total expenses', rs(exp), pct(exp)] },
          { kind: 'gap', cells: [] },
          { kind: 'total', cells: [net >= 0 ? 'PROFIT (sales minus expenses)' : 'LOSS (sales minus expenses)', rs(net), margin == null ? '-' : `${margin.toFixed(1)}%`] },
        ],
        notes: [
          'Total sales = all bills in this period minus returns.',
          'Profit = total sales minus expenses. Share of sales shows how much of every 100 rupees of sales each line is.',
        ],
      });
      await saveFile(blob, `Statistics-${dayKey(new Date())}.pdf`, 'Statistics');
    } catch (err) {
      console.error(err);
      toast.error('Could not create the PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 glass-header">
        <Link to="/dashboard" aria-label="Back" className="glass-btn"><ChevronLeft size={20} /></Link>
        <h1 className="text-lg font-bold text-slate-900">Statistics</h1>
        <button type="button" onClick={handleExportPDF} disabled={loading || isExporting} aria-label="Download PDF" className="glass-btn disabled:opacity-50"><Download size={18} /></button>
      </header>

      <main className="space-y-4 px-4 pb-4">
        <div role="tablist" aria-label="Period" className="grid grid-cols-3 gap-2">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSel(-1); }}
              className={cn('h-11 rounded-full text-sm font-bold transition-colors duration-300', tab === k ? 'bg-blue-600 text-white shadow-md' : 'glass-btn-flat text-slate-600')}>{l}</button>
          ))}
        </div>

        <section aria-label="Sales chart" className="glass-card rounded-3xl p-5">
          <p className="text-center text-3xl font-black tabular-nums text-slate-900">{loading ? '...' : formatCurrency(sales)}</p>
          <p className="mt-1 text-center text-xs text-slate-500">{bucket.full}</p>
          <div className="mt-5 flex h-44 items-end gap-2" role="group" aria-label="Net sales by period">
            {buckets.map((b, i) => (
              <button key={b.label + i} type="button" onClick={() => setSel(i)} aria-label={`${b.full}: ${formatCurrency(totals[i].rev)}`} aria-pressed={i === idx}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <motion.span
                  key={`${tab}-${i}`}
                  initial={{ height: '6%' }}
                  animate={{ height: `${Math.max(6, (totals[i].rev / max) * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 140, damping: 22, delay: i * 0.04 }}
                  className={cn('w-full rounded-xl transition-colors duration-500', i === idx ? 'bg-blue-600' : 'bar-idle')}
                />
                <span className={cn('text-[0.65rem] font-semibold', i === idx ? 'text-slate-900' : 'text-slate-500')}>{b.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">{failed ? 'Could not load. Check your connection.' : 'Tap any bar to view details'}</p>
        </section>

        {!loading && (
          <>

            <section aria-label="Breakdown" className="glass-card grid grid-cols-2 gap-4 rounded-3xl p-5">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Expenses</p>
                <div className="flex justify-center"><Donut size={132} segments={catSegs} center={catSegs[0] ? shareOf(catSegs[0].value) : '-'} sub={catSegs[0]?.label} label="Expenses by category" /></div>
                <Legend rows={catSegs.length ? catSegs.map((x) => ({ label: x.label, color: x.color, pct: shareOf(x.value) })) : [{ label: 'No expenses', color: '#94a3b8', pct: '-' }]} />
              </div>
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Payments</p>
                <div className="flex justify-center"><Donut size={132} segments={paySegs} center={payShare(cash)} sub="cash" label="Cash and UPI split" /></div>
                <Legend rows={paySegs.map((x) => ({ label: x.label, color: x.color, pct: payShare(x.value) }))} />
              </div>
            </section>

            <section aria-label="Profit trend" className="glass-card rounded-3xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net profit trend</p>
                <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white tabular-nums">{formatCurrency(net)}</span>
              </div>
              <Trend values={totals.map((t) => t.rev - t.exp)} labels={buckets.map((b) => b.label)} active={idx} />
            </section>

            <section className="glass-card rounded-3xl p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net profit</p>
              <p className={cn('mt-1 text-3xl font-black tabular-nums', net >= 0 ? 'text-emerald-500' : 'text-red-500')}>{formatCurrency(net)}</p>
              <p className="mt-1 text-xs text-slate-500">{margin == null ? 'No sales in this period' : `${margin.toFixed(1)}% margin on net sales`}</p>
            </section>

            <section className="glass-card rounded-3xl p-5">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Income</h3>
              <Row label="Cash sales" value={cash} sub={pct(cash)} />
              <Row label="UPI sales" value={upi} sub={pct(upi)} />
              <Row strong label="Net sales" value={sales} sub="after returns" />
            </section>

            <section aria-label="Expenses">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Expenses</h3>
              <ul className="space-y-2">
                {cats.map(([cat, amt]) => (
                  <li key={cat} className="glass-card flex items-center justify-between rounded-2xl px-4 py-3">
                    <span><span className="block text-sm font-bold capitalize text-slate-900">{sanitizeText(cat).replace(/_/g, ' ')}</span>
                      <span className="block text-xs text-slate-500">Total: {formatCurrency(amt)}</span></span>
                    <span className="rounded-lg bg-red-500/15 px-2 py-1 text-xs font-bold text-red-500">{pct(amt)}</span>
                  </li>
                ))}
                {cats.length === 0 && <li className="glass-card rounded-2xl px-4 py-3 text-sm italic text-slate-500">No expenses recorded</li>}
              </ul>
              <div className="mt-2 flex justify-between px-1 text-sm font-black text-slate-900"><span>Total expenses</span><span className="tabular-nums">{formatCurrency(exp)}</span></div>
            </section>
          </>
        )}
        {loading && <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>}
      </main>

      <BottomNav />
    </div>
  );
}
