import { toast } from 'sonner';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Share2, Download, ChevronLeft } from 'lucide-react';
import { formatCurrency, cn, sanitizeText } from '../lib/utils';
import { DayPicker } from 'react-day-picker';
import { Drawer } from 'vaul';
import { Skeleton } from '../components/Skeleton';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { startOfDay, endOfDay, startOfWeek, startOfMonth, subMonths, format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function PLScreen() {
  const { user, shopId, shopName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('simple'); // 'simple' | 'detailed'

  // Dates
  const [dateRangeType, setDateRangeType] = useState('today'); // today, week, month, custom
  const [dateRange, setDateRange] = useState({ from: startOfDay(new Date()), to: endOfDay(new Date()) });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [tempRange, setTempRange] = useState({ from: undefined, to: undefined });
  const [vsLastMonth, setVsLastMonth] = useState(false);

  // Data
  const [data, setData] = useState({
    revenue: { total: 0, cash: 0, upi: 0, splitCash: 0, splitUpi: 0 },
    expenses: { total: 0, byCategory: {} },
    netEarnings: 0
  });

  const [compareData, setCompareData] = useState(null);

  const reportRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchPLData = useCallback(async (range) => {
    if (!shopId || !range.from) return null;

    try {
      const toDate = range.to ? endOfDay(range.to) : endOfDay(range.from);

      const billsRef = collection(db, `shops/${shopId}/bills`);
      const qBills = query(billsRef, where('createdAt', '>=', range.from), where('createdAt', '<=', toDate), limit(100));

      const expRef = collection(db, `shops/${shopId}/expenses`);
      const qExp = query(expRef, where('createdAt', '>=', range.from), where('createdAt', '<=', toDate), limit(100));

      const [billsSnap, expSnap] = await Promise.all([getDocs(qBills), getDocs(qExp)]);

      let rev = { total: 0, cash: 0, upi: 0, splitCash: 0, splitUpi: 0 };

      billsSnap.forEach(doc => {
        const b = doc.data({ serverTimestamps: 'estimate' });
        if (b.type === 'reversal' || b.isVoided) return;

        let multiplier = b.type === 'return' ? -1 : 1;
        const total = (b.grandTotal || 0) * multiplier;

        rev.total += total;

        const method = b.payment?.method || b.paymentMethod;
        if (method === 'split' && b.payment?.breakdown) {
           rev.splitCash += (b.payment.breakdown.cash || 0) * multiplier;
           rev.splitUpi += (b.payment.breakdown.upi || 0) * multiplier;
        } else if (method === 'upi' || b.refundMethod === 'upi') {
           rev.upi += total;
        } else {
           rev.cash += total;
        }
      });

      let expTotal = 0;
      let expCats = {};
      expSnap.forEach(doc => {
        const e = doc.data({ serverTimestamps: 'estimate' });
        const amt = parseFloat(e.amount) || 0;
        expTotal += amt;
        const cat = e.category || 'other';
        expCats[cat] = (expCats[cat] || 0) + amt;
      });

      return {
        revenue: rev,
        expenses: { total: expTotal, byCategory: expCats },
        netEarnings: rev.total - expTotal
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
      if (dateRangeType === 'today') currentRange = { from: startOfDay(new Date()), to: endOfDay(new Date()) };
      else if (dateRangeType === 'week') currentRange = { from: startOfWeek(new Date(), {weekStartsOn:1}), to: endOfDay(new Date()) };
      else if (dateRangeType === 'month') currentRange = { from: startOfMonth(new Date()), to: endOfDay(new Date()) };

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


  const handleShare = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const clone = reportRef.current.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.overflow = 'visible';
      clone.style.height = 'max-content';
      clone.style.width = '384px';
      clone.style.backgroundColor = '#F8FAFC';
      clone.style.padding = '24px';

      const header = document.createElement('div');
      header.innerHTML = `<h2 style="font-size:24px; font-weight:bold; color:#0F172A; text-align:center; margin-bottom:4px;">${shopName || 'Shop'} P&L</h2>
                          <p style="text-align:center; color:#64748B; font-size:14px; margin-bottom:24px;">${dateRangeType.toUpperCase()}</p>`;
      clone.insertBefore(header, clone.firstChild);

      document.body.appendChild(clone);

      const canvas = await html2canvas(clone, {
        scale: window.devicePixelRatio || 2,
        useCORS: true,
        backgroundColor: '#F8FAFC',
        windowWidth: 384
      });
      document.body.removeChild(clone);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `PL-Report-${Date.now()}.png`, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'P&L Report' });
            return;
          } catch (_err) { return null; }
        }
        const text = encodeURIComponent(`P&L Report from ${shopName || 'Shop'}\nNet Earnings: ₹${data.netEarnings}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
      }, 'image/png');
    } catch (err) {
      console.error(err);
      toast('Failed to share.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${shopName || 'Ledgro Shop'} - P&L Report`, 20, 20);

    doc.setFontSize(12);
    const dateStr = dateRangeType === 'custom' && dateRange.from
      ? `${format(dateRange.from, 'MMM dd, yyyy')} - ${dateRange.to ? format(dateRange.to, 'MMM dd, yyyy') : ''}`
      : dateRangeType.toUpperCase();
    doc.text(`Date Range: ${dateStr}`, 20, 30);

    let y = 50;

    doc.setFontSize(16);
    doc.text('Summary', 20, y);
    y += 10;

    doc.setFontSize(12);
    doc.text(`Total Revenue: ₹${data.revenue.total}`, 20, y); y += 8;
    doc.text(`Total Expenses: ₹${data.expenses.total}`, 20, y); y += 8;

    doc.setFontSize(14);
    doc.setTextColor(data.netEarnings >= 0 ? 34 : 220, data.netEarnings >= 0 ? 197 : 38, 94); // green/red roughly
    doc.text(`Net Earnings: ₹${data.netEarnings}`, 20, y + 5);

    doc.save(`PL-Report-${Date.now()}.pdf`);
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
           <Link to="/dashboard" className="p-1 -ml-1 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
              <ChevronLeft size={24} />
           </Link>
           <h1 className="text-xl font-bold text-slate-900">Profit & Loss</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={handleShare} disabled={loading || isExporting} className="p-2 text-blue-600 bg-blue-50 rounded-full"><Share2 size={18} /></button>
          <button onClick={handleExportPDF} disabled={loading} className="p-2 text-blue-600 bg-blue-50 rounded-full"><Download size={18} /></button>
        </div>
      </header>

      <div className="p-4 bg-white border-b border-slate-100 space-y-4">
         <div className="flex bg-slate-100 p-1 rounded-xl">
           <button onClick={() => setMode('simple')} className={cn("flex-1 py-1.5 text-sm font-bold rounded-lg transition-all", mode==='simple' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>Simple</button>
           <button onClick={() => setMode('detailed')} className={cn("flex-1 py-1.5 text-sm font-bold rounded-lg transition-all", mode==='detailed' ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>Detailed</button>
         </div>

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
            Compare vs Last Month
         </label>
      </div>

      <main className="p-4" ref={reportRef}>
        {loading ? (
           <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /></div>
        ) : mode === 'simple' ? (
           <div className="space-y-4">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
                 <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Total Revenue</p>
                 <p className="text-3xl font-black text-slate-900">{formatCurrency(data.revenue.total)}</p>
                 {vsLastMonth && compareData && (
                    <p className={cn("text-sm font-medium mt-1", data.revenue.total >= compareData.revenue.total ? "text-green-600" : "text-red-500")}>
                      {data.revenue.total >= compareData.revenue.total ? '↑' : '↓'} {formatCurrency(Math.abs(data.revenue.total - compareData.revenue.total))} vs last month
                    </p>
                 )}
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
                 <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Total Expenses</p>
                 <p className="text-3xl font-black text-slate-900">{formatCurrency(data.expenses.total)}</p>
              </div>
              <div className={cn("p-6 rounded-2xl border shadow-sm text-center", data.netEarnings >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100")}>
                 <p className={cn("text-sm font-bold uppercase tracking-wider mb-2", data.netEarnings >= 0 ? "text-green-600/70" : "text-red-500/70")}>Net Earnings</p>
                 <p className={cn("text-4xl font-black", data.netEarnings >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(data.netEarnings)}</p>
              </div>
           </div>
        ) : (
           <div className="space-y-6">
             <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3 mb-3">Revenue Breakdown</h3>
                <div className="space-y-3 text-sm font-medium">
                   <div className="flex justify-between text-slate-600"><span>Cash Sales</span><span>{formatCurrency(data.revenue.cash)}</span></div>
                   <div className="flex justify-between text-slate-600"><span>UPI Sales</span><span>{formatCurrency(data.revenue.upi)}</span></div>
                   <div className="flex justify-between text-slate-600"><span>Split (Cash part)</span><span>{formatCurrency(data.revenue.splitCash)}</span></div>
                   <div className="flex justify-between text-slate-600"><span>Split (UPI part)</span><span>{formatCurrency(data.revenue.splitUpi)}</span></div>
                   <div className="flex justify-between font-black text-slate-900 pt-2 border-t border-slate-100 text-lg"><span>Total Revenue</span><span>{formatCurrency(data.revenue.total)}</span></div>
                </div>
             </div>

             <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3 mb-3">Expenses Breakdown</h3>
                <div className="space-y-3 text-sm font-medium">
                   {Object.entries(data.expenses.byCategory).map(([cat, amt]) => (
                     <div key={sanitizeText(cat)} className="flex justify-between text-slate-600"><span className="capitalize">{sanitizeText(cat)}</span><span>{formatCurrency(amt)}</span></div>
                   ))}
                   {Object.keys(data.expenses.byCategory).length === 0 && <div className="text-slate-400 italic">No expenses recorded</div>}
                   <div className="flex justify-between font-black text-slate-900 pt-2 border-t border-slate-100 text-lg"><span>Total Expenses</span><span>{formatCurrency(data.expenses.total)}</span></div>
                </div>
             </div>

             <div className={cn("p-6 rounded-2xl border shadow-sm text-center", data.netEarnings >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100")}>
                 <p className={cn("text-sm font-bold uppercase tracking-wider mb-2", data.netEarnings >= 0 ? "text-green-600/70" : "text-red-500/70")}>Net Earnings</p>
                 <p className={cn("text-4xl font-black", data.netEarnings >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(data.netEarnings)}</p>
              </div>
           </div>
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
