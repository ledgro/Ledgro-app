import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { LogOut, PlusCircle, FileText, Receipt, PieChart, RefreshCcw } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { Skeleton } from '../components/Skeleton';
import { startOfDay, endOfDay } from 'date-fns';

export default function Dashboard() {
  const { user, shopId, signOut } = useAuth();
  const [recentBills, setRecentBills] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      // Fetch Recent Bills
      const recentQ = query(collection(db, `shops/${shopId}/bills`), orderBy('createdAt', 'desc'), limit(5));
      const recentSnap = await getDocs(recentQ);
      const bills = recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentBills(bills);

      // Fetch Today's Bills for Total
      const todayStart = startOfDay(new Date());
      const todayEnd = endOfDay(new Date());
      // Re-using the index created earlier for Analytics
      const todayQ = query(
        collection(db, `shops/${shopId}/bills`),
        orderBy('createdAt', 'desc')
      );

      const todaySnap = await getDocs(todayQ);
      let total = 0;
      let count = 0;

      todaySnap.docs.forEach(doc => {
        const data = doc.data({ serverTimestamps: 'estimate' });
        if (!data.createdAt) return;

        const date = data.createdAt.toDate();
        if (date >= todayStart && date <= todayEnd) {
          if (data.type === 'reversal') {
            total -= Math.abs(data.grandTotal);
          } else {
            total += data.grandTotal;
            count++;
          }
        }
      });

      setTodayTotal(total);
      setTodayCount(count);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [shopId]);

  const initials = user?.displayName ? user.displayName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-24">
      {/* Top Header */}
      <header className="bg-white px-4 py-4 flex justify-between items-center sticky top-0 z-30">
        <h1 className="text-xl font-bold text-slate-900 font-bruno">Ledgro</h1>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-lg">
            {initials}
          </div>
          <button onClick={signOut} className="text-slate-400 hover:text-red-500 transition-colors p-1">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="p-4 space-y-6">

        {/* Today's Total Card */}
        <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-blue-100 font-medium mb-1">Today's Sales</p>
            {loading ? (
              <div className="space-y-3 mt-2">
                <Skeleton className="h-12 w-48 bg-blue-400/50 rounded-lg" />
                <Skeleton className="h-4 w-32 bg-blue-400/50" />
              </div>
            ) : (
              <>
                <h2 className="text-5xl font-black tracking-tight mb-2">
                  {formatCurrency(todayTotal)}
                </h2>
                <p className="text-blue-200 text-sm font-medium">{todayCount} bills generated</p>
              </>
            )}
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-10">
            <PieChart size={160} />
          </div>
        </div>

        {/* 2x2 Quick Action Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/pos" className="bg-white p-4 rounded-2xl shadow-subtle border border-slate-100 flex flex-col items-start gap-3 active:scale-95 transition-transform">
            <div className="bg-blue-50 text-blue-600 p-3 rounded-full">
              <PlusCircle size={24} strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-slate-900">New Bill</span>
          </Link>

          <Link to="/ledger" className="bg-white p-4 rounded-2xl shadow-subtle border border-slate-100 flex flex-col items-start gap-3 active:scale-95 transition-transform">
            <div className="bg-slate-50 text-slate-600 p-3 rounded-full">
              <FileText size={24} />
            </div>
            <span className="font-semibold text-slate-900">History</span>
          </Link>

          <Link to="/expenses" className="bg-white p-4 rounded-2xl shadow-subtle border border-slate-100 flex flex-col items-start gap-3 active:scale-95 transition-transform">
            <div className="bg-slate-50 text-slate-600 p-3 rounded-full">
              <Receipt size={24} />
            </div>
            <span className="font-semibold text-slate-900">Expenses</span>
          </Link>

          <Link to="/analytics" className="bg-white p-4 rounded-2xl shadow-subtle border border-slate-100 flex flex-col items-start gap-3 active:scale-95 transition-transform">
            <div className="bg-slate-50 text-slate-600 p-3 rounded-full">
              <PieChart size={24} />
            </div>
            <span className="font-semibold text-slate-900">Reports</span>
          </Link>
        </div>

        {/* Recent Bills List */}
        <div>
          <div className="flex justify-between items-end mb-4 px-1">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Activity</h2>
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
      <BottomNav />
    </div>
  );
}
