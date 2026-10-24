import { toast } from 'sonner';
import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { useAuth } from '../context/AuthContext';
import { readStatsRange } from '../lib/dayStats';
import { dayKey, bizDate, sumStats } from '../lib/statsMath';
import { rs, buildReport } from '../lib/reportExport';
import { saveFile } from '../lib/shareFile';
import BottomNav from '../components/BottomNav';
import { Download, ChevronLeft } from 'lucide-react';
import { formatCurrency, cn, sanitizeText } from '../lib/utils';
import { DayPicker } from 'react-day-picker';
import { Drawer } from 'vaul';
import { Skeleton } from '../components/Skeleton';

import { startOfDay, endOfDay, startOfWeek, startOfMonth, subMonths, format } from 'date-fns';
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

export default function PLScreen() {
  const { shopId, shopName } = useAuth();
  const [loading, setLoading] = useState(true);

  const [dateRangeType, setDateRangeType] = useState('today');
  const [dateRange, setDateRange] = useState({ from: startOfDay(bizDate()), to: endOfDay(bizDate()) });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [tempRange, setTempRange] = useState({ from: undefined, to: undefined });
  const [vsLastMonth, setVsLastMonth] = useState(false);

  const [rawdata, setData] = useState({
    revenue: { total: 0, cash: 0, upi: 0, splitCash: 0, splitUpi: 0 },
    expenses: { total: 0, byCategory: {} },
    netEarnings: 0
  });

  const [compareDataRaw, setCompareData] = useState(null);
  const data = useDeferredValue(rawdata);
  const compareData = useDeferredValue(compareDataRaw);

  const [isExporting, setIsExporting] = useState(false);

  const fetchPLData = useCallback(async (range) => {
    if (!shopId || !range.from) return null;

    try {
      const toDate = range.to ? endOfDay(range.to) : endOfDay(range.from);
      const days = await readStatsRange(shopId, dayKey(range.from), dayKey(toDate));
      const t = sumStats([...days.values()]);

      return {
        revenue: { total: t.rev, cash: t.cash, upi: t.upi, splitCash: t.splitCash, splitUpi: t.splitUpi },
        expenses: { total: t.exp, byCategory: t.cats },
        netEarnings: t.rev - t.exp
      };
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [shopId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);

      let currentRange = dateRange;
      if (dateRangeType === 'today') currentRange = { from: startOfDay(bizDate()), to: endOfDay(bizDate()) };
      else if (dateRangeType === 'week') currentRange = { from: startOfWeek(bizDate(), {weekStartsOn:1}), to: endOfDay(bizDate()) };
      else if (dateRangeType === 'month') currentRange = { from: startOfMonth(bizDate()), to: endOfDay(bizDate()) };

      const currentData = await fetchPLData(currentRange);

      let compData = null;
      if (vsLastMonth) {
        const prevMonthFrom = subMonths(currentRange.from, 1);
        const prevMonthTo = subMonths(currentRange.to || currentRange.from, 1);
        compData = await fetchPLData({ from: prevMonthFrom, to: prevMonthTo });
      }

      if (active) {
        if (currentData) setData(currentData);
        if (compData) setCompareData(compData);
        setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [dateRangeType, dateRange, vsLastMonth, fetchPLData]);

  const rangeLabel = dateRangeType === 'custom' && dateRange.from
    ? `${format(dateRange.from, 'dd MMM yyyy')} - ${format(dateRange.to || dateRange.from, 'dd MMM yyyy')}`
    : { today: 'Today', week: 'This week', month: 'This month' }[dateRangeType];

  const sales = data.revenue.total;
  const exp = data.expenses.total;
  const net = data.netEarnings;
  const margin = sales > 0 ? (net / sales) * 100 : null;
  const pct = (v) => (sales > 0 ? `${((v / sales) * 100).toFixed(1)}%` : '-');
  const cats = Object.entries(data.expenses.byCategory || {}).sort((x, y) => y[1] - x[1]);
  const cash = data.revenue.cash + data.revenue.splitCash;
  const upi = data.revenue.upi + data.revenue.splitUpi;

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const blob = await buildReport('pdf', {
        title: `${shopName || 'Shop'} - Profit & Loss`,
        subtitle: rangeLabel,
        columns: [{ label: 'Item', w: 5 }, { label: 'Amount', w: 2, align: 'right' }, { label: '% of sales', w: 1, align: 'right' }],
        rows: [
          ['INCOME', '', ''],
          ['Cash sales', rs(cash), pct(cash)],
          ['UPI sales', rs(upi), pct(upi)],
          ['Net sales (after returns)', rs(sales), sales > 0 ? '100.0%' : '-'],
          ['', '', ''],
          ['EXPENSES', '', ''],
          ...cats.map(([k, v]) => [String(k).replace(/_/g, ' '), rs(v), pct(v)]),
          ['Total expenses', rs(exp), pct(exp)],
          ['', '', ''],
          ['NET PROFIT', rs(net), margin == null ? '-' : `${margin.toFixed(1)}%`],
        ],
      });
      await saveFile(blob, `Profit-Loss-${dayKey(new Date())}.pdf`, 'Profit & Loss');
    } catch (err) {
      console.error(err);
      toast.error('Could not create the PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const delta = (cur, prev) => (vsLastMonth && prev != null ? (
    <p className={cn('text-xs font-semibold mt-1', cur >= prev ? 'text-green-600' : 'text-red-500')}>
      {cur >= prev ? '▲' : '▼'} {formatCurrency(Math.abs(cur - prev))} vs last month
    </p>
  ) : null);

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
           <Link to="/dashboard" className="p-1 -ml-1 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
              <ChevronLeft size={24} />
           </Link>
           <h1 className="text-xl font-bold text-slate-900">Profit & Loss Report</h1>
        </div>
        <button onClick={handleExportPDF} disabled={loading || isExporting} className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-blue-600 bg-blue-50 rounded-full disabled:opacity-50"><Download size={16} /> PDF</button>
      </header>

      <div className="p-4 bg-white border-b border-slate-100 space-y-4">
         <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
            {['today', 'week', 'month', 'custom'].map(t => (
               <button key={t} onClick={() => { setDateRangeType(t); if(t==='custom') setIsCalendarOpen(true); }}
                 className={cn("px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap", dateRangeType===t ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600")}
               >
                 {t.charAt(0).toUpperCase() + t.slice(1)}
               </button>
            ))}
         </div>
         <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 mt-2">
            <input type="checkbox" checked={vsLastMonth} onChange={(e) => setVsLastMonth(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
            Compare with last month
         </label>
      </div>

      <main className="p-4 space-y-4">
        {loading ? (
          <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <>
            <div className={cn('p-5 rounded-2xl border shadow-sm', net >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100')}>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net profit · {rangeLabel}</p>
              <p className={cn('text-4xl font-black mt-1', net >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(net)}</p>
              <p className="text-xs text-slate-500 mt-1">{margin == null ? 'No sales in this range' : `${margin.toFixed(1)}% margin on net sales`}</p>
              {delta(net, compareData?.netEarnings)}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Income</h3>
              <Row label="Cash sales" value={cash} sub={pct(cash)} />
              <Row label="UPI sales" value={upi} sub={pct(upi)} />
              <Row strong label="Net sales" value={sales} sub="after returns" />
              {delta(sales, compareData?.revenue.total)}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Expenses</h3>
              {cats.map(([cat, amt]) => <Row key={cat} label={sanitizeText(cat).replace(/_/g, ' ')} value={amt} sub={pct(amt)} />)}
              {cats.length === 0 && <p className="text-sm text-slate-500 italic py-2">No expenses recorded</p>}
              <Row strong label="Total expenses" value={exp} sub={pct(exp)} />
            </div>
          </>
        )}
      </main>

      <Drawer.Root open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Drawer.Content className="bg-white flex flex-col rounded-t-[24px] mt-24 fixed bottom-0 left-0 right-0 z-50 h-auto max-h-[90vh]">
            <div className="p-4 bg-white flex-1 overflow-y-auto rounded-t-[24px]">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
              <div className="flex justify-center">
                <DayPicker mode="range" selected={tempRange} onSelect={setTempRange} className="border border-slate-100 p-4 rounded-2xl shadow-sm" />
              </div>
              <button onClick={() => { setDateRange(tempRange); setDateRangeType('custom'); setIsCalendarOpen(false); }} disabled={!tempRange?.from}
                className="w-full mt-6 bg-blue-600 text-white font-bold h-14 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                Apply Custom Range
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
