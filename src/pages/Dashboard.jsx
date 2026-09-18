import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { LogOut, RefreshCcw, Calendar as CalendarIcon, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { Skeleton } from '../components/Skeleton';
import { startOfDay, endOfDay, isToday, isYesterday, format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import "react-day-picker/style.css";
import { Drawer } from 'vaul';

export default function Dashboard() {
  const { user, shopId, shopName, signOut } = useAuth();

  // Analytics State
  const [dateRange, setDateRange] = useState({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [tempRange, setTempRange] = useState({ from: undefined, to: undefined });

  // Data State
  const [recentBills, setRecentBills] = useState([]);
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    if (!shopId) return;
    setLoading(true);

    try {
      // 1. Fetch optimized analytics data within bounds to prevent full-table scans
      const billsQuery = query(
        collection(db, `shops/${shopId}/bills`),
        where('createdAt', '>=', dateRange.from),
        where('createdAt', '<=', dateRange.to)
      );

      const expensesQuery = query(
        collection(db, `shops/${shopId}/expenses`),
        where('createdAt', '>=', dateRange.from),
        where('createdAt', '<=', dateRange.to)
      );

      // 2. Fetch Recent Bills (Globally, latest 5)
      const recentQ = query(collection(db, `shops/${shopId}/bills`), orderBy('createdAt', 'desc'), limit(5));

      const [billsSnap, expSnap, recentSnap] = await Promise.all([
        getDocs(billsQuery),
        getDocs(expensesQuery),
        getDocs(recentQ)
      ]);

      setBills(billsSnap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      setRecentBills(recentSnap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [shopId, dateRange]);

  // Deterministic Client-Side Reduction (Offline safe)
  const metrics = useMemo(() => {
    let grossRevenue = 0;
    let totalReversals = 0;
    let totalExpenses = 0;

    bills.forEach(bill => {
      if (bill.type === 'reversal') {
        totalReversals += Math.abs(bill.grandTotal);
      } else {
        grossRevenue += bill.grandTotal || 0;
      }
    });

    expenses.forEach(exp => {
      totalExpenses += exp.amount || 0;
    });

    const netRevenue = grossRevenue - totalReversals;
    const netProfit = netRevenue - totalExpenses;

    return {
      grossRevenue,
      totalReversals,
      netRevenue,
      totalExpenses,
      netProfit,
      transactionCount: bills.filter(b => b.type !== 'reversal').length
    };
  }, [bills, expenses]);

  const setQuickDate = (type) => {
    const today = new Date();
    if (type === 'today') {
      setDateRange({ from: startOfDay(today), to: endOfDay(today) });
    } else if (type === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      setDateRange({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
    }
  };

  const handleApplyCustomDate = () => {
    if (tempRange.from) {
      setDateRange({
        from: startOfDay(tempRange.from),
        to: tempRange.to ? endOfDay(tempRange.to) : endOfDay(tempRange.from)
      });
      setIsCalendarOpen(false);
    }
  };

  const handleExportCSV = () => {
    if (!bills.length && !expenses.length) {
      alert("No data to export for this date range.");
      return;
    }

    const rows = [['Type', 'Date', 'Amount', 'Details', 'Payment Method']];

    bills.forEach(b => {
      const dateStr = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString() : 'Pending';
      const typeStr = b.type === 'reversal' ? 'Refund/Void' : 'Sale';
      rows.push([typeStr, dateStr, b.grandTotal, b.type === 'reversal' ? `Reversal for ${b.originalBillId}` : `${b.items?.length || 0} items`, b.paymentMethod || '-']);
    });

    expenses.forEach(e => {
      const dateStr = e.createdAt?.toDate ? e.createdAt.toDate().toLocaleString() : 'Pending';
      rows.push(['Expense', dateStr, -e.amount, e.description || e.categoryId || 'Expense', '-']);
    });

    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ledgro_report_${format(dateRange.from, 'yyyyMMdd')}_to_${format(dateRange.to, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDateLabel = () => {
    if (isToday(dateRange.from) && isToday(dateRange.to)) return 'Today';
    if (isYesterday(dateRange.from) && isYesterday(dateRange.to)) return 'Yesterday';
    if (dateRange.from.getTime() === startOfDay(dateRange.from).getTime() && !dateRange.to) {
      return format(dateRange.from, 'MMM d, yyyy');
    }
    return `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}`;
  };

  const initials = user?.displayName ? user.displayName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-24">
      {/* Top Header */}
      <header className="bg-white px-4 py-4 flex justify-between items-center sticky top-0 z-30 shadow-subtle border-b border-slate-100">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-blue-600 font-bruno">Ledgro</h1>
          {shopName && <p className="text-xs text-slate-500 font-semibold mt-0.5">{shopName}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
            {initials}
          </div>
          <button onClick={signOut} className="text-slate-400 hover:text-red-500 transition-colors p-1">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="p-4 space-y-6">

        {/* Date Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setQuickDate('today')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${isToday(dateRange.from) && isToday(dateRange.to) ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            Today
          </button>
          <button
            onClick={() => setQuickDate('yesterday')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${isYesterday(dateRange.from) && isYesterday(dateRange.to) ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            Yesterday
          </button>
          <button
            onClick={() => setIsCalendarOpen(true)}
            className="py-2 px-3 bg-white border border-slate-200 rounded-lg text-slate-600 flex items-center justify-center"
          >
            <CalendarIcon size={18} />
          </button>
        </div>

        <div className="flex justify-between items-end px-1">
          <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{getDateLabel()}</p>
          <button onClick={handleExportCSV} className="text-blue-600 text-sm font-semibold flex items-center gap-1 active:scale-95">
            <Download size={16} /> Export
          </button>
        </div>

        {/* Analytics Section */}
        {loading ? (
          <div className="space-y-4">
             <Skeleton className="h-32 w-full rounded-3xl" />
             <div className="grid grid-cols-2 gap-4">
               <Skeleton className="h-24 w-full rounded-2xl" />
               <Skeleton className="h-24 w-full rounded-2xl" />
             </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Primary Metric: Net Profit */}
            <div className={`p-6 rounded-3xl shadow-sm border ${metrics.netProfit >= 0 ? 'bg-green-600 border-green-700' : 'bg-red-600 border-red-700'} text-white`}>
              <p className="text-sm font-medium text-white/80 mb-1">Net Profit</p>
              <h2 className="text-4xl font-black tracking-tight">{formatCurrency(metrics.netProfit)}</h2>
            </div>

            {/* Metric Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-subtle">
                <div className="flex items-center gap-2 text-slate-500 mb-2">
                  <TrendingUp size={16} className="text-blue-500" />
                  <span className="text-sm font-semibold">Gross Rev</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(metrics.grossRevenue)}</p>
                <p className="text-xs text-slate-400 mt-1">{metrics.transactionCount} transactions</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-subtle">
                <div className="flex items-center gap-2 text-slate-500 mb-2">
                  <TrendingDown size={16} className="text-red-500" />
                  <span className="text-sm font-semibold">Expenses</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(metrics.totalExpenses)}</p>
                <p className="text-xs text-slate-400 mt-1">{expenses.length} entries</p>
              </div>
            </div>

            {/* Reversals row */}
            {metrics.totalReversals > 0 && (
              <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex justify-between items-center text-orange-800">
                <span className="text-sm font-semibold">Voided/Returned</span>
                <span className="font-bold">-{formatCurrency(metrics.totalReversals)}</span>
              </div>
            )}
          </div>
        )}

        {/* Recent Bills List */}
        <div className="pt-4">
          <div className="flex justify-between items-end mb-4 px-1">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Bills</h2>
            <button onClick={fetchDashboardData} className="text-slate-400 p-1 active:rotate-180 transition-transform">
              <RefreshCcw size={16} />
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-subtle border border-slate-100 overflow-hidden divide-y divide-slate-50">
            {loading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex justify-between items-center py-2">
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : recentBills.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-medium">No activity yet.</div>
            ) : (
              recentBills.map(bill => {
                const isReversal = bill.type === 'reversal';
                const timeStr = bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Syncing...';

                return (
                  <div key={bill.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className={cn("font-bold text-lg", isReversal ? "text-red-600" : "text-slate-900")}>
                        {formatCurrency(bill.grandTotal)}
                      </p>
                      <p className="text-sm text-slate-500 font-medium mt-0.5">{timeStr}</p>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider",
                      isReversal ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"
                    )}>
                      {isReversal ? 'Void' : bill.paymentMethod || 'Cash'}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </main>

      {/* Date Picker Drawer */}
      <Drawer.Root open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-white flex flex-col rounded-t-[10px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-50 focus:outline-none">
            <div className="p-4 bg-white rounded-t-[10px] flex flex-col items-center pb-safe">
              <div className="w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
              <Drawer.Title className="font-bold text-slate-900 mb-4 text-xl self-start px-4">
                Select Date Range
              </Drawer.Title>

              <DayPicker
                mode="range"
                selected={tempRange}
                onSelect={setTempRange}
                className="font-sans border-none"
              />

              <div className="w-full px-4 mt-6">
                <button
                  onClick={handleApplyCustomDate}
                  disabled={!tempRange.from}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl active:bg-blue-700 disabled:opacity-50"
                >
                  Apply Dates
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
