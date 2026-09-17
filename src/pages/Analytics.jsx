import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { startOfDay, endOfDay, isToday, isYesterday, format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import "react-day-picker/style.css";
import { Drawer } from 'vaul';
import BottomNav from '../components/BottomNav';
import { Calendar as CalendarIcon, TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';

export default function Analytics() {
  const { shopId } = useAuth();

  // Date Range State
  const [dateRange, setDateRange] = useState({
    from: startOfDay(new Date()),
    to: endOfDay(new Date())
  });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [tempRange, setTempRange] = useState({ from: undefined, to: undefined });

  // Data State
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      if (!shopId) return;
      setLoading(true);

      try {
        // We query everything between the selected date range.
        // Because of the PrefixTrie auto indexing we enabled, this works perfectly offline.
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

        const [billsSnap, expSnap] = await Promise.all([
          getDocs(billsQuery),
          getDocs(expensesQuery)
        ]);

        setBills(billsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalyticsData();
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

  const handleApplyCustomDate = () => {
    if (tempRange.from) {
      setDateRange({
        from: startOfDay(tempRange.from),
        to: tempRange.to ? endOfDay(tempRange.to) : endOfDay(tempRange.from)
      });
      setIsCalendarOpen(false);
    }
  };

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

  // Helper for dynamic date label
  const getDateLabel = () => {
    if (isToday(dateRange.from) && isToday(dateRange.to)) return 'Today';
    if (isYesterday(dateRange.from) && isYesterday(dateRange.to)) return 'Yesterday';
    if (dateRange.from.getTime() === startOfDay(dateRange.from).getTime() && !dateRange.to) {
      return format(dateRange.from, 'MMM d, yyyy');
    }
    return `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}`;
  };

  const handleExportCSV = () => {
    if (!bills.length && !expenses.length) {
      alert("No data to export for this date range.");
      return;
    }

    const rows = [];

    // Add Headers
    rows.push(['Type', 'Date', 'Amount', 'Details', 'Payment Method']);

    // Add Bills
    bills.forEach(b => {
      const dateStr = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString() : 'Pending';
      const typeStr = b.type === 'reversal' ? 'Refund/Void' : 'Sale';
      const amountStr = b.grandTotal;
      const detailsStr = b.type === 'reversal' ? `Reversal for ${b.originalBillId}` : `${b.items?.length || 0} items`;
      rows.push([typeStr, dateStr, amountStr, detailsStr, b.paymentMethod || '-']);
    });

    // Add Expenses
    expenses.forEach(e => {
      const dateStr = e.createdAt?.toDate ? e.createdAt.toDate().toLocaleString() : 'Pending';
      const typeStr = 'Expense';
      const amountStr = -e.amount; // Negative for expense
      const detailsStr = e.description || e.categoryId || 'Expense';
      rows.push([typeStr, dateStr, amountStr, detailsStr, '-']);
    });

    // Convert to CSV string
    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    // Create Blob and Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ledgro_report_${format(dateRange.from, 'yyyyMMdd')}_to_${format(dateRange.to, 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <button onClick={handleExportCSV} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-full transition-colors flex items-center gap-1 text-sm font-medium">
          <Download size={18} /> Export
        </button>
      </header>

      <main className="p-4 space-y-6">

        {/* Date Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setQuickDate('today')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${isToday(dateRange.from) && isToday(dateRange.to) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            Today
          </button>
          <button
            onClick={() => setQuickDate('yesterday')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${isYesterday(dateRange.from) && isYesterday(dateRange.to) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            Yesterday
          </button>
          <button
            onClick={() => setIsCalendarOpen(true)}
            className="py-2 px-3 bg-white border border-gray-200 rounded-lg text-gray-600 flex items-center justify-center"
          >
            <CalendarIcon size={18} />
          </button>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{getDateLabel()}</p>
        </div>

        {loading ? (
           <div className="flex justify-center py-12">
             <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
           </div>
        ) : (
          <>
            {/* Primary Metric: Net Profit */}
            <div className={`p-6 rounded-2xl shadow-sm border ${metrics.netProfit >= 0 ? 'bg-green-600 border-green-700' : 'bg-red-600 border-red-700'} text-white text-center`}>
              <p className="text-sm font-medium opacity-80 mb-1">Net Profit</p>
              <h2 className="text-4xl font-black tracking-tight">₹{metrics.netProfit.toLocaleString()}</h2>
            </div>

            {/* Metric Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <TrendingUp size={16} className="text-indigo-500" />
                  <span className="text-sm font-medium">Gross Revenue</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">₹{metrics.grossRevenue.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{metrics.transactionCount} transactions</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 mb-2">
                  <TrendingDown size={16} className="text-red-500" />
                  <span className="text-sm font-medium">Total Expenses</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">₹{metrics.totalExpenses.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">{expenses.length} entries</p>
              </div>
            </div>

            {/* Reversals row */}
            {metrics.totalReversals > 0 && (
              <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex justify-between items-center text-orange-800">
                <span className="text-sm font-medium">Voided/Returned</span>
                <span className="font-bold">-₹{metrics.totalReversals.toLocaleString()}</span>
              </div>
            )}
          </>
        )}
      </main>

      {/* Date Picker Drawer */}
      <Drawer.Root open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-white flex flex-col rounded-t-[10px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-50 focus:outline-none">
            <div className="p-4 bg-white rounded-t-[10px] flex flex-col items-center pb-safe">
              <div className="w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-300 mb-6" />
              <Drawer.Title className="font-bold text-gray-900 mb-4 text-xl self-start px-4">
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
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl active:bg-indigo-700 disabled:opacity-50"
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
