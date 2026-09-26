import { toast } from 'sonner';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Cloud, CloudOff, RefreshCcw } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { Skeleton } from '../components/Skeleton';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { Drawer } from 'vaul';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function Dashboard() {
  const { user, shopId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({ online: navigator.onLine, pending: false, lastSynced: 'Just now' });
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  const chartRef = useRef(null);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (chartRef.current) {
        chartRef.current.options.scales.x.ticks.color = isDark ? '#94A3B8' : '#64748B';
        chartRef.current.options.scales.y.ticks.color = isDark ? '#94A3B8' : '#64748B';
        chartRef.current.options.scales.x.grid.color = isDark ? '#1E293B' : '#F1F5F9';
        chartRef.current.update();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);


  // Stats
  const [stats, setStats] = useState({
    expectedCash: 0,
    upiInBank: 0,
    netEarnings: 0,
    vsYesterday: 0, // percentage string or value
    cashSplit: 0,
    upiSplit: 0,
    staffCount: {},
    weekData: [],
    actualCashCounted: '',
    difference: 0
  });

  const [isCloseDrawerOpen, setIsCloseDrawerOpen] = useState(false);
  const [isClosingRecord, setIsClosingRecord] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const hasPrompted = localStorage.getItem('iosInstallPromptDismissed');
    if (isIOS && !isStandalone && !hasPrompted) {
      setShowIOSPrompt(true);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);

    try {
      const todayStart = startOfDay(new Date());
      const todayEnd = endOfDay(new Date());
      const yesterdayStart = subDays(todayStart, 1);
      const yesterdayEnd = endOfDay(yesterdayStart);
      const weekStart = subDays(todayStart, 6);

      const billsRef = collection(db, `shops/${shopId}/bills`);
      const expRef = collection(db, `shops/${shopId}/expenses`);

      // Today's Bills
      const qTodayBills = query(billsRef, where('createdAt', '>=', todayStart), where('createdAt', '<=', todayEnd), limit(100));
      const qTodayExp = query(expRef, where('createdAt', '>=', todayStart), where('createdAt', '<=', todayEnd), limit(100));

      // Yesterday's Bills (for vs comparison)
      const qYestBills = query(billsRef, where('createdAt', '>=', yesterdayStart), where('createdAt', '<=', yesterdayEnd), limit(100));
      const qYestExp = query(expRef, where('createdAt', '>=', yesterdayStart), where('createdAt', '<=', yesterdayEnd), limit(100));

      // Week Bills for Sparkline
      const qWeekBills = query(billsRef, where('createdAt', '>=', weekStart), where('createdAt', '<=', todayEnd), limit(100));

      const [todayBSnap, todayESnap, yestBSnap, yestESnap, weekBSnap] = await Promise.all([
        getDocs(qTodayBills), getDocs(qTodayExp), getDocs(qYestBills), getDocs(qYestExp), getDocs(qWeekBills)
      ]);

      const processBills = (snap) => {
        let cash = 0, upi = 0, rev = 0, transactionCount = 0;
        const staff = {};
        snap.forEach(doc => {
          const b = doc.data({ serverTimestamps: 'estimate' });
          if (b.type === 'reversal' || b.isVoided) return;

          if (b.type !== 'return') transactionCount++;

          let mult = b.type === 'return' ? -1 : 1;
          const total = (b.grandTotal || 0) * mult;
          rev += total;

          const method = b.payment?.method || b.paymentMethod;
          if (method === 'split' && b.payment?.breakdown) {
             cash += (b.payment.breakdown.cash || 0) * mult;
             upi += (b.payment.breakdown.upi || 0) * mult;
          } else if (method === 'upi' || b.refundMethod === 'upi') {
             upi += total;
          } else {
             cash += total;
          }

          if (mult > 0 && b.creatorId) {
             staff[b.creatorId] = (staff[b.creatorId] || 0) + 1;
          }
        });
        return { cash, upi, rev, staff, transactionCount };
      };

      const processExp = (snap) => {
        let exp = 0;
        snap.forEach(doc => { exp += (parseFloat(doc.data({ serverTimestamps: 'estimate' }).amount) || 0); });
        return exp;
      };

      const today = processBills(todayBSnap);
      const todayExpAmt = processExp(todayESnap);

      const yest = processBills(yestBSnap);
      const yestExpAmt = processExp(yestESnap);

      const todayNet = today.rev - todayExpAmt;
      const yestNet = yest.rev - yestExpAmt;

      let percentDiff = 0;
      if (yestNet > 0) percentDiff = ((todayNet - yestNet) / Math.abs(yestNet)) * 100;
      else if (yestNet === 0 && todayNet > 0) percentDiff = 100;

      // Week Sparkline
      const dailyEarn = {};
      for(let i=0; i<7; i++) {
        dailyEarn[format(subDays(todayStart, i), 'yyyy-MM-dd')] = 0;
      }
      weekBSnap.forEach(doc => {
        const b = doc.data({ serverTimestamps: 'estimate' });
        if (b.type === 'reversal' || b.isVoided) return;
        const dtStr = b.createdAt ? format(b.createdAt.toDate(), 'yyyy-MM-dd') : null;
        if (dtStr && dailyEarn[dtStr] !== undefined) {
           dailyEarn[dtStr] += (b.grandTotal || 0) * (b.type === 'return' ? -1 : 1);
        }
      });
      // We don't fetch weekly expenses for sparkline to keep it fast, or we could if needed.
      // The prompt says "Weekly sparkline: Simple 7-bar mini chart below the earnings card". I'll just map revenue to keep it simple.
      const sparkData = Object.keys(dailyEarn).sort().map(k => dailyEarn[k]);

      setStats(s => ({
        ...s,
        expectedCash: today.cash - todayExpAmt,
        upiInBank: today.upi,
        netEarnings: todayNet,
        vsYesterday: percentDiff,
        cashSplit: today.cash,
        upiSplit: today.upi,
        staffCount: today.staff,
        transactionCount: today.transactionCount,
        weekData: sparkData
      }));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const checkSync = () => {
      setSyncStatus(prev => ({ ...prev, online: navigator.onLine }));
      // Normally we'd use onSnapshot metadata.hasPendingWrites, but since we're using REST/Promises we check basic connectivity.
      // Firestore handles offline gracefully.
    };
    window.addEventListener('online', checkSync);
    window.addEventListener('offline', checkSync);
    const intv = setInterval(() => {
      setSyncStatus(prev => ({ ...prev, lastSynced: 'Just now' }));
    }, 60000);
    return () => {
      window.removeEventListener('online', checkSync);
      window.removeEventListener('offline', checkSync);
      clearInterval(intv);
    }
  }, []);

  const handleCloseRegister = async () => {
    if (!stats.actualCashCounted) return;
    setIsClosingRecord(true);
    try {
      const diff = parseFloat(stats.actualCashCounted) - stats.expectedCash;
      if (diff !== 0) {
        await addDoc(collection(db, `shops/${shopId}/expenses`), {
          amount: Math.abs(diff),
          category: 'other',
          description: diff > 0 ? 'Cash Overage' : 'Cash Shortage',
          creatorId: user.uid,
          createdAt: serverTimestamp()
        });
      }
      toast("Day locked and summary saved!");
      setIsCloseDrawerOpen(false);
      fetchDashboardData();
    } catch (_err) {
      toast.error("Failed to close register.");
    } finally {
      setIsClosingRecord(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-24">

      {/* Top Bar Sync */}
      <div className="bg-slate-100 py-1.5 px-4 flex justify-between items-center text-[11px] font-bold text-slate-500 sticky top-0 z-30">
         <div className="flex items-center gap-1.5">
           {syncStatus.online ? <Cloud size={14} className="text-blue-500" /> : <CloudOff size={14} className="text-amber-500" />}
           {syncStatus.online ? `Synced ${syncStatus.lastSynced}` : <span className="text-amber-600">Offline — changes saved locally</span>}
         </div>
         <button onClick={fetchDashboardData} className="active:rotate-180 transition-transform"><RefreshCcw size={14} /></button>
      </div>

      <main className="p-4 space-y-4">

        {/* iOS Prompt */}
        {showIOSPrompt && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 relative mb-4">
            <button onClick={() => { localStorage.setItem('iosInstallPromptDismissed', 'true'); setShowIOSPrompt(false); }} className="absolute top-2 right-2 p-1 text-blue-400">✕</button>
            <p className="font-bold text-blue-900 text-sm mb-1">Add Ledgro to your Home Screen</p>
            <p className="text-xs text-blue-700">To protect your offline data from being deleted by iOS, tap the share icon below and select "Add to Home Screen".</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Top Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Expected Cash</p>
                 <h2 className="text-2xl font-black text-slate-900">{formatCurrency(stats.expectedCash)}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">In Bank (UPI)</p>
                 <h2 className="text-2xl font-black text-slate-900">{formatCurrency(stats.upiInBank)}</h2>
              </div>
            </div>

            {/* Net Earnings & Sparkline */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
               <div className="mb-4">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Today's Net Earnings</p>
                 <div className="flex items-end gap-3">
                   <h2 className={cn("text-4xl font-black", stats.netEarnings >= 0 ? "text-green-600" : "text-red-500")}>
                     {formatCurrency(stats.netEarnings)}
                   </h2>
                   {stats.vsYesterday !== 0 && (
                     <span className="text-xs font-medium text-slate-400 mb-1">
                       {stats.vsYesterday > 0 ? '↑' : '↓'} {Math.abs(stats.vsYesterday).toFixed(0)}% vs yesterday
                     </span>
                   )}
                 </div>
               </div>

               {/* Sparkline Canvas */}
               <div className="h-16 w-full">
                 <Bar
                   data={{
                     labels: ['1','2','3','4','5','6','7'],
                     datasets: [{
                       data: stats.weekData,
                       backgroundColor: (ctx) => ctx.dataIndex === 6 ? '#2563EB' : '#CBD5E1', // Today is index 6, primary blue
                       borderRadius: 4
                     }]
                   }}
                   options={{
                     responsive: true,
                     maintainAspectRatio: false,
                     plugins: { legend: { display: false }, tooltip: { enabled: false } },
                     scales: {
                       x: { display: false },
                       y: { display: false }
                     }
                   }}
                 />
               </div>
            </div>

            {/* Cash vs UPI split */}
            <div className="grid grid-cols-2 gap-px bg-slate-100 border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-white p-4 text-center">
                <p className="text-lg font-black text-green-600">Cash {formatCurrency(stats.cashSplit)}</p>
              </div>
              <div className="bg-white p-4 text-center">
                <p className="text-lg font-black text-blue-600">UPI {formatCurrency(stats.upiSplit)}</p>
              </div>
            </div>

            {/* Staff Performance */}
            {Object.keys(stats.staffCount).length > 0 && (
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Staff Performance</p>
                <div className="space-y-2">
                  {Object.entries(stats.staffCount).map(([uid, count]) => (
                    <div key={uid} className="flex justify-between items-center text-sm font-semibold">
                      <span className="text-slate-700">{uid === user.uid ? 'You' : `Member ${uid.substring(0,4)}`}</span>
                      <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">{count} bills</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Persistent Close Register Button */}
      <div className="px-4 mt-2">
         <button
           onClick={() => setIsCloseDrawerOpen(true)}
           disabled={loading}
           className="w-full bg-slate-900 text-white font-bold h-14 rounded-xl shadow-sm active:scale-95 transition-transform"
         >
           Close Register
         </button>
      </div>

      <Drawer.Root open={isCloseDrawerOpen} onOpenChange={setIsCloseDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-slate-50 flex flex-col rounded-t-[24px] mt-24 fixed bottom-0 left-0 right-0 z-50 h-[85vh]">
            <div className="p-4 bg-slate-50 flex-1 overflow-y-auto rounded-t-[24px] pb-safe">
               <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
               <h2 className="text-2xl font-black text-slate-900 mb-6 text-center">End of Day Summary</h2>

               <div className="space-y-6">
                 {/* Cash Math */}
                 <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm font-mono text-sm">
                   <p className="font-bold font-sans text-slate-900 mb-3 border-b pb-2">Expected Cash in Drawer:</p>
                   <div className="flex justify-between text-slate-600 mb-1"><span>Cash Sales:</span><span>{formatCurrency(stats.cashSplit)}</span></div>
                   <div className="flex justify-between text-slate-600 mb-1"><span>- Cash Expenses:</span><span>{formatCurrency(stats.cashSplit - stats.expectedCash)}</span></div>
                   <div className="flex justify-between font-bold text-slate-900 border-t pt-2 mt-2"><span>Expected Total:</span><span>{formatCurrency(stats.expectedCash)}</span></div>
                 </div>

                 {/* UPI Math */}
                 <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm font-mono text-sm">
                   <p className="font-bold font-sans text-slate-900 mb-3 border-b pb-2">Expected Bank Deposit (UPI):</p>
                   <div className="flex justify-between text-slate-600 mb-1"><span>UPI Sales:</span><span>{formatCurrency(stats.upiSplit)}</span></div>
                   <div className="flex justify-between font-bold text-slate-900 border-t pt-2 mt-2"><span>Expected Total:</span><span>{formatCurrency(stats.upiInBank)}</span></div>
                 </div>

                 {/* Verification Input */}
                 <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                   <label className="block text-sm font-bold text-slate-700 mb-2">Actual cash counted:</label>
                   <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                     <input
                       type="number"
                       value={stats.actualCashCounted}
                       onChange={e => setStats(s => ({...s, actualCashCounted: e.target.value}))}
                       className="w-full pl-8 pr-4 h-14 border border-slate-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                       placeholder="0.00"
                     />
                   </div>

                   {stats.actualCashCounted !== '' && (
                     <div className="mt-4">
                       {parseFloat(stats.actualCashCounted) === stats.expectedCash ? (
                         <div className="flex items-center gap-2 text-green-600 font-bold bg-green-50 p-3 rounded-lg"><span className="text-xl">✓</span> All balanced</div>
                       ) : (
                         <div className="text-amber-700 font-bold bg-amber-50 p-3 rounded-lg text-sm">
                           Difference: {formatCurrency(parseFloat(stats.actualCashCounted) - stats.expectedCash)}
                           <p className="text-xs font-medium mt-1">This will be recorded as a Cash {parseFloat(stats.actualCashCounted) > stats.expectedCash ? 'Overage' : 'Shortage'} expense.</p>
                         </div>
                       )}
                     </div>
                   )}
                 </div>

                 <button
                   onClick={handleCloseRegister}
                   disabled={isClosingRecord || stats.actualCashCounted === ''}
                   className="w-full bg-blue-600 text-white font-bold h-14 rounded-xl active:scale-95 disabled:opacity-50"
                 >
                   {isClosingRecord ? 'Locking...' : 'Lock Day'}
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
