import { toast } from 'sonner';
import { useState, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import { useAuth } from '../context/AuthContext';
import { checkStorageHealth } from '../lib/storageHealth';
import { serverNow, CLOCK_MSG } from '../lib/clockDrift';
import { bizDayKey } from '../lib/statsMath';
import { serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Cloud, CloudOff, RefreshCcw, Eye, EyeOff } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { Skeleton } from '../components/Skeleton';
import { Drawer } from 'vaul';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { computeDailyAggregations } from '../lib/aggregations';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function Dashboard() {
  const { user, shopId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({ online: navigator.onLine, pending: false, lastSynced: 'Just now' });
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  // Privacy: amounts are blurred every time the dashboard opens. Reveal lasts 30s,
  // and re-hides when the app goes to the background.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (hidden) return undefined;
    const t = setTimeout(() => setHidden(true), 30000);
    return () => clearTimeout(t);
  }, [hidden]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') setHidden(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const mask = (node) => (hidden
    ? <span className="blur-md select-none pointer-events-none" aria-hidden="true">{node}</span>
    : node);

  const chartRef = useRef(null);



  // Stats
  const [rawStats, setStats] = useState({
    expectedCash: 0,
    upiInBank: 0,
    netEarnings: 0,
    vsYesterday: 0, // percentage string or value
    cashSplit: 0,
    upiSplit: 0,
    staffCount: {},
    weekData: []
  });

  const stats = useDeferredValue(rawStats);
  const [actualCashCounted, setActualCashCounted] = useState(''); // Moved out of deferred stats
  const [closureDate, setClosureDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [isCloseDrawerOpen, setIsCloseDrawerOpen] = useState(false);
  const [isClosingRecord, setIsClosingRecord] = useState(false);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const hasPrompted = localStorage.getItem('iosInstallPromptDismissed');
    if (isIOS && !isStandalone && !hasPrompted) {
      setShowIOSPrompt(true);
    }
  }, []);

  const fetchDashboardData = useCallback(async (isMountedObj = { current: true }) => {
    if (!shopId) return;
    setLoading(true);

    try {
      const data = await computeDailyAggregations(shopId);
      if (data && isMountedObj.current) {
        setStats(s => ({ ...s, ...data }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isMountedObj.current) setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    const isMountedObj = { current: true };
    fetchDashboardData(isMountedObj);
    return () => { isMountedObj.current = false; };
  }, [fetchDashboardData]);

  useEffect(() => {
    checkStorageHealth().then(health => {
      if (!health) return;
      if (!sessionStorage.getItem('storageWarningShown')) {
        if (health.isCritical) {
          toast.error(`Storage almost full (${health.usagePercent.toFixed(0)}% used). Export your data soon.`);
          sessionStorage.setItem('storageWarningShown', 'true');
        } else if (health.isWarning) {
          toast.warning(`Storage at ${health.usagePercent.toFixed(0)}%. Consider exporting data.`);
          sessionStorage.setItem('storageWarningShown', 'true');
        }
      }
    });
  }, []);

  useEffect(() => {
    const checkSync = () => {
      setSyncStatus(prev => ({ ...prev, online: navigator.onLine }));
    };
    window.addEventListener('online', checkSync);
    window.addEventListener('offline', checkSync);
    return () => {
      window.removeEventListener('online', checkSync);
      window.removeEventListener('offline', checkSync);
    }
  }, []);

  const handleCloseRegister = async () => {
    if (!navigator.onLine) {
      toast.error("You must be online to save the cash count.");
      return;
    }

    const parsedActual = parseFloat(actualCashCounted);
    if (isNaN(parsedActual) || parsedActual < 0) {
      toast.error("Please enter a valid positive amount.");
      return;
    }

    setIsClosingRecord(true);

    try {
      // Use the server-corrected clock: a wrong phone clock must not lock the wrong day.
      const nowC = await serverNow();
      const closureDocId = bizDayKey(nowC);
      setClosureDate(closureDocId);
      const diffPaise = Math.round(parsedActual * 100) - stats.expectedCash;

      const closureData = {
        expectedCash: stats.expectedCash,
        actualCash: Math.round(parsedActual * 100),
        difference: diffPaise,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
        date: closureDocId
      };

      // Cash count: can be re-saved any time today (latest count wins). Nothing is locked
      // and no expense is created: it only records expected vs counted.
      const closureRef = doc(db, `shops/${shopId}/dailyClosures`, closureDocId);
      await setDoc(closureRef, closureData);

      toast.success("Cash count saved!");
      setIsCloseDrawerOpen(false);
      setActualCashCounted('');
      fetchDashboardData();
    } catch (err) {
      toast.error(err?.message === 'CLOCK' ? CLOCK_MSG : "Could not save the cash count. Please try again.");
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
           {syncStatus.online ? `Online` : <span className="text-amber-600">Offline: reconnect to bill or save</span>}
         </div>
         <div className="flex items-center gap-4">
           <button
             type="button"
             aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
             aria-pressed={!hidden}
             onClick={() => setHidden((h) => !h)}
             className="p-2 -m-2 text-slate-500 active:scale-90 transition-transform"
           >
             {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
           </button>
           <button aria-label="Refresh Dashboard" onClick={() => fetchDashboardData()} className="p-2 -m-2 active:rotate-180 transition-transform"><RefreshCcw size={14} /></button>
         </div>
      </div>

      <main className="p-4 space-y-4">

        {/* iOS Prompt */}
        {showIOSPrompt && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 relative mb-4">
            <button aria-label="Close" onClick={() => { localStorage.setItem('iosInstallPromptDismissed', 'true'); setShowIOSPrompt(false); }} className="absolute top-2 right-2 p-1 text-blue-400">✕</button>
            <p className="font-bold text-blue-900 text-sm mb-1">Add Ledgro to your Home Screen</p>
            <p className="text-xs text-blue-700">For quicker opening and a full screen app, tap the share icon below and select "Add to Home Screen".</p>
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
                 <h2 className="text-2xl font-black text-slate-900">{mask(formatCurrency(stats.expectedCash))}</h2>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">In Bank (UPI)</p>
                 <h2 className="text-2xl font-black text-slate-900">{mask(formatCurrency(stats.upiInBank))}</h2>
              </div>
            </div>

            {/* Net Earnings & Sparkline */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
               <div className="mb-4">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Today's Net Earnings</p>
                 <div className="flex items-end gap-3">
                   <h2 className={cn("text-4xl font-black", stats.netEarnings >= 0 ? "text-green-600" : "text-red-500")}>
                     {mask(formatCurrency(stats.netEarnings))}
                   </h2>
                   {stats.vsYesterday !== 0 && (
                     <span className={cn("text-xs font-medium text-slate-400 mb-1", hidden && "blur-sm select-none")}>
                       {stats.vsYesterday > 0 ? '↑' : '↓'} {Math.abs(stats.vsYesterday).toFixed(0)}% vs yesterday
                     </span>
                   )}
                 </div>
               </div>

               {/* Sparkline Canvas */}
               <div className={cn("h-16 w-full transition-[filter]", hidden && "blur-sm")}>
                 <Bar
                   ref={chartRef}
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
                <p className="text-lg font-black text-green-600">Cash {mask(formatCurrency(stats.cashSplit))}</p>
              </div>
              <div className="bg-white p-4 text-center">
                <p className="text-lg font-black text-blue-600">UPI {mask(formatCurrency(stats.upiSplit))}</p>
              </div>
            </div>

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
           Count Cash
         </button>
      </div>

      <Drawer.Root open={isCloseDrawerOpen} onOpenChange={setIsCloseDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-slate-50 flex flex-col rounded-t-[24px] mt-24 fixed bottom-0 left-0 right-0 z-50 h-[85vh]">
            <div className="p-4 bg-slate-50 flex-1 overflow-y-auto rounded-t-[24px] pb-safe">
               <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
               <h2 className="text-2xl font-black text-slate-900 mb-6 text-center">Cash Count</h2>

               <div className="space-y-6">
                 {/* Cash Math */}
                 <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm font-mono text-sm">
                   <p className="font-bold font-sans text-slate-900 mb-3 border-b pb-2">Expected Cash in Drawer:</p>
                   <div className="flex justify-between text-slate-600 mb-1"><span>Cash Sales:</span><span>{mask(formatCurrency(stats.cashSplit))}</span></div>
                   <div className="flex justify-between text-slate-600 mb-1"><span>- Cash Expenses:</span><span>{mask(formatCurrency(stats.cashSplit - stats.expectedCash))}</span></div>
                   <div className="flex justify-between font-bold text-slate-900 border-t pt-2 mt-2"><span>Expected Total:</span><span>{mask(formatCurrency(stats.expectedCash))}</span></div>
                 </div>

                 {/* UPI Math */}
                 <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm font-mono text-sm">
                   <p className="font-bold font-sans text-slate-900 mb-3 border-b pb-2">Expected Bank Deposit (UPI):</p>
                   <div className="flex justify-between text-slate-600 mb-1"><span>UPI Sales:</span><span>{mask(formatCurrency(stats.upiSplit))}</span></div>
                   <div className="flex justify-between font-bold text-slate-900 border-t pt-2 mt-2"><span>Expected Total:</span><span>{mask(formatCurrency(stats.upiInBank))}</span></div>
                 </div>

                 {/* Verification Input */}
                 <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Closure Date</label>
                     <input
                       type="date"
                       disabled
                       value={closureDate}
                       onChange={e => setClosureDate(e.target.value)}
                       className="w-full px-4 h-12 border border-slate-200 rounded-xl font-bold text-slate-600 bg-slate-50 opacity-70 outline-none"
                     />
                   </div>

                   <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">Actual cash counted:</label>
                     <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                       <input
                         type="number" inputMode="decimal"
                         value={actualCashCounted}
                         onChange={e => setActualCashCounted(e.target.value)}
                         className="w-full pl-8 pr-4 h-14 border border-slate-200 rounded-xl font-bold text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                         placeholder="0.00"
                       />
                     </div>
                   </div>

                   {actualCashCounted !== '' && !isNaN(parseFloat(actualCashCounted)) && (
                     <div className="mt-4">
                       {Math.round(parseFloat(actualCashCounted) * 100) === stats.expectedCash ? (
                         <div className="flex items-center gap-2 text-green-600 font-bold bg-green-50 p-3 rounded-lg"><span className="text-xl">✓</span> All balanced</div>
                       ) : (
                         <div className="text-amber-700 font-bold bg-amber-50 p-3 rounded-lg text-sm">
                           Difference: {mask(formatCurrency(Math.abs(Math.round(parseFloat(actualCashCounted) * 100) - stats.expectedCash)))}
                           <p className="text-xs font-medium mt-1">Saved with the count only. It is not added to expenses or income.</p>
                         </div>
                       )}
                     </div>
                   )}
                 </div>

                 <button
                   onClick={handleCloseRegister}
                   disabled={isClosingRecord || actualCashCounted === '' || isNaN(parseFloat(actualCashCounted))}
                   className="w-full bg-blue-600 text-white font-bold h-14 rounded-xl active:scale-95 disabled:opacity-50"
                 >
                   {isClosingRecord ? 'Saving...' : 'Save Count'}
                 </button>
               </div>
            </div>
            <button aria-label="Close" onClick={() => setIsCloseDrawerOpen(false)} className="absolute top-4 right-4 p-2 bg-slate-200 rounded-full text-slate-600">✕</button>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
