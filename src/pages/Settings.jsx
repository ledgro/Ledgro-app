import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchAllPaged, flushPendingWrites } from '../lib/firestoreUtils';
import { rebuildStats } from '../lib/dayStats';
import { buildReport, rs } from '../lib/reportExport';
import { saveFile } from '../lib/shareFile';
import ExportMenu from '../components/ExportMenu';
import BottomNav from '../components/BottomNav';
import { Store, Settings2, Database, User, LogOut, ChevronLeft, Save, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hapticVibrate } from '../lib/utils';
import { format } from 'date-fns';
import { checkStorageHealth } from '../lib/storageHealth';

export default function Settings() {
  const { user, shopId, shopAdminId, shopProfile, signOut, deleteAccount } = useAuth();
  const isOwner = !!user?.uid && shopAdminId === user.uid;
  const [recalculating, setRecalculating] = useState(false);
  const navigate = useNavigate();

  // Shop Profile State
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [tagline, setTagline] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // App Preferences State (localStorage)
  const [defaultPayment, setDefaultPayment] = useState(() => localStorage.getItem('ledgro_defaultPayment') || 'cash');
  const [hapticFeedback, setHapticFeedback] = useState(() => localStorage.getItem('ledgro_haptic') !== 'false');
  const [autoReset, setAutoReset] = useState(() => localStorage.getItem('ledgro_autoReset') !== 'false');
  const [storageHealth, setStorageHealth] = useState(null);




  useEffect(() => {
    checkStorageHealth().then(setStorageHealth);
  }, []);

  useEffect(() => {
    const fetchShopProfile = async () => {
      if (!shopId) return;
      try {
        const docRef = doc(db, 'shops', shopId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data({ serverTimestamps: 'estimate' });
          setShopName(data.name || '');
          setAddress(data.address || '');
          setPhone(data.phone || '');
          setTagline(data.tagline || '');
        }
      } catch (_err) {
        console.error("Failed to load shop profile", _err);
      }
    };
    fetchShopProfile();
  }, [shopId]);

  // Sync preferences to localStorage


  useEffect(() => {
    try { localStorage.setItem('ledgro_defaultPayment', defaultPayment);
    localStorage.setItem('ledgro_haptic', String(hapticFeedback));
    localStorage.setItem('ledgro_autoReset', String(autoReset)); } catch { /* storage blocked */ }
  }, [defaultPayment, hapticFeedback, autoReset]);

  const CUTOFF_OPTIONS = [[0, '12:00 AM (midnight)'], [120, '2:00 AM'], [180, '3:00 AM'], [240, '4:00 AM'], [270, '4:30 AM'], [300, '5:00 AM'], [330, '5:30 AM']];
  const handleCutoff = async (e) => {
    const min = Number(e.target.value);
    if (!shopId || !Number.isInteger(min)) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!window.confirm('Change when the business day starts? Past totals keep their old days until you tap Recalculate totals.')) return;
    try {
      await updateDoc(doc(db, 'shops', shopId), { dayCutoffMin: min, updatedAt: serverTimestamp() });
      toast.success('Day start saved. Tap Recalculate totals to fix past days.');
    } catch (err) {
      console.error(err);
      toast.error('Could not save day start.');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!shopId || !shopName.trim()) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    setSavingProfile(true);
    try {
      const docRef = doc(db, 'shops', shopId);
      await updateDoc(docRef, {
        name: shopName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        tagline: tagline.trim(),
        updatedAt: serverTimestamp()
      });
      if (hapticFeedback) hapticVibrate([50, 30, 50]);
      toast("Shop profile saved!");
    } catch (_err) {
      console.error(_err);
      if (hapticFeedback) hapticVibrate([100, 50, 100]);
      toast.error("Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const loadAllForExport = async () => {
    const [billDocs, expDocs] = await Promise.all([
      fetchAllPaged(`shops/${shopId}/bills`),
      fetchAllPaged(`shops/${shopId}/expenses`),
    ]);
    const bills = billDocs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const expenses = expDocs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    return { bills, expenses };
  };

  // PDF / PNG report of bills (expenses follow in the same list)
  const handleExportData = async (fmt) => {
    if (!shopId) return;
    try {
      const { bills, expenses } = await loadAllForExport();
      const reversed = new Set(bills.filter((b) => b.type === 'reversal' && b.originalBillId).map((b) => b.originalBillId));
      const when = (x) => (x.createdAt?.toDate ? format(x.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : '');

      let sales = 0;
      const rows = [];
      [...bills].reverse().forEach((b) => {
        const status = reversed.has(b.id) || b.type === 'reversal' ? 'voided' : (b.type || 'sale');
        if (status === 'sale' || status === 'return') sales += Number(b.grandTotal) || 0;
        const pay = b.payment?.method || b.paymentMethod || b.refundMethod || '';
        rows.push([when(b), 'Bill ' + (b.billNo || b.id.slice(0, 8)), status, pay, rs(b.grandTotal)]);
      });
      let spent = 0;
      [...expenses].reverse().forEach((e) => {
        const adj = e.category === 'cash_adjustment';
        if (!adj) spent += Number(e.amount) || 0;
        rows.push([when(e), `Expense: ${e.description || e.category || ''}`, adj ? 'adjustment' : 'expense', e.paidVia || 'cash', rs(-(Number(e.amount) || 0))]);
      });
      if (rows.length === 0) { toast.info('Nothing to export yet.'); return; }

      const blob = await buildReport(fmt, {
        title: 'Ledgro - Full Data Export',
        subtitle: `Generated ${new Date().toLocaleString()}`,
        summary: [`Net sales: ${rs(sales)}   Expenses: ${rs(spent)}   Net: ${rs(sales - spent)}`],
        columns: [
          { label: 'Date', w: 1.5, max: 18 }, { label: 'Entry', w: 3.5, max: 60 }, { label: 'Status', w: 1, max: 12 },
          { label: 'Pay', w: 0.8, max: 8 }, { label: 'Amount', w: 1.2, align: 'right', max: 18 },
        ],
        rows,
      });
      await saveFile(blob, `ledgro-export-${Date.now()}.${fmt}`, 'Ledgro export');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export data. Check connection.');
    }
  };

  // Full-fidelity machine backup (restore / audit)
  // Daily totals are stored as bills are made. Bills made before that existed (or any drift)
  // are fixed by recomputing the last 90 days straight from the real bills and expenses.
  const handleRecalculate = async () => {
    if (!shopId || recalculating) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!window.confirm('Recalculate daily totals from your bills and expenses of the last 90 days? This replaces the stored totals and reads every bill in that period, which can take a while on a busy shop.')) return;
    setRecalculating(true);
    try {
      const r = await rebuildStats(shopId, 90);
      toast.success(`Totals recalculated from ${r.bills} bills.`);
    } catch (err) {
      console.error(err);
      toast.error('Could not recalculate totals. Check your connection and try again.');
    } finally {
      setRecalculating(false);
    }
  };

  const handleBackupJson = async () => {
    if (!shopId) return;
    try {
      const data = await loadAllForExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      await saveFile(blob, `ledgro-backup-${Date.now()}.json`, 'Ledgro backup');
    } catch (err) {
      console.error(err);
      toast.error('Backup failed. Check connection.');
    }
  };

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    if (!navigator.onLine) {
      toast.error("Cannot delete account while offline. Please connect to the internet.");
      return;
    }
    const confirmDelete = window.confirm(
      "Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone."
    );
    if (!confirmDelete) return;

    setIsDeletingAccount(true);
    try {
      await deleteAccount();
    } catch (err) {
      toast.error(err.message || "Failed to delete account.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      if (err?.message === 'SYNC_PENDING') {
        toast.error('Unsynced bills pending. Connect to the internet and wait until they sync, then sign out.');
      } else {
        toast.error('Failed to sign out.');
      }
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('Clear app files and reload? Your data stays safe in the cloud.')) return;
    if (!(await flushPendingWrites())) {
      toast.error('Unsynced bills pending. Connect to the internet until they sync, then retry.');
      return;
    }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
    } catch (err) {
      console.warn('Cache clear partly failed', err);
    }
    window.location.reload();
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-24">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-4 flex items-center gap-3 shadow-subtle">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-slate-400 hover:text-slate-600 active:bg-slate-100 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      </header>

      <main className="p-4 space-y-6">
        {/* Shop Profile Section */}
        <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold mb-4">
            <Store size={20} className="text-blue-600" />
            <h2>Shop Profile</h2>
          </div>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Shop Name *</label>
              <input type="text" required maxLength={60} value={shopName} onChange={(e) => setShopName(e.target.value)} className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Address</label>
              <input type="text" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Phone Number</label>
              <input type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Receipt Footer Tagline</label>
              <input type="text" maxLength={100} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Thank you for shopping with us!" className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
            <button type="submit" disabled={savingProfile} className="w-full bg-blue-50 text-blue-600 font-bold h-12 rounded-xl flex items-center justify-center gap-2 active:bg-blue-100 transition-colors">
              <Save size={18} /> {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </section>

        {/* App Preferences */}
        <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold mb-4">
            <Settings2 size={20} className="text-blue-600" />
            <h2>App Preferences</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900 block text-sm">Default Payment</span>
                <span className="text-xs text-slate-500">Auto-selected in POS</span>
              </div>
              <select value={defaultPayment} onChange={(e) => setDefaultPayment(e.target.value)} className="h-10 px-3 border border-slate-200 rounded-lg text-sm font-semibold bg-slate-50 focus:outline-none">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </div>
            <hr className="border-slate-100" />
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-semibold text-slate-900 block text-sm">Haptic Feedback</span>
                <span className="text-xs text-slate-500">Vibrate on actions</span>
              </div>
              <div className="relative inline-block w-12 h-6 rounded-full">
                 <input type="checkbox" className="peer sr-only" checked={hapticFeedback} onChange={(e) => setHapticFeedback(e.target.checked)} />
                 <span className="absolute inset-0 bg-slate-300 rounded-full transition peer-checked:bg-blue-600"></span>
                 <span className="absolute inset-y-1 left-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:left-7"></span>
               </div>
            </label>
            <hr className="border-slate-100" />
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="font-semibold text-slate-900 block text-sm">Auto-Reset Bill</span>
                <span className="text-xs text-slate-500">Clear POS after saving</span>
              </div>
              <div className="relative inline-block w-12 h-6 rounded-full">
                 <input type="checkbox" className="peer sr-only" checked={autoReset} onChange={(e) => setAutoReset(e.target.checked)} />
                 <span className="absolute inset-0 bg-slate-300 rounded-full transition peer-checked:bg-blue-600"></span>
                 <span className="absolute inset-y-1 left-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:left-7"></span>
               </div>
            </label>
          </div>
        </section>

        {/* Data Management */}
        <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold mb-4">
            <Database size={20} className="text-blue-600" />
            <h2>Data Management</h2>
          </div>
          <div className="space-y-3">
            {storageHealth && (
              <div className="mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-slate-700">Storage Usage</span>
                  <div className="text-right flex flex-col items-end">
    <span className="text-xs text-slate-500">{storageHealth.usageMB} MB / {storageHealth.quotaMB} MB</span>
    {storageHealth.persisted !== undefined && (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${storageHealth.persisted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {storageHealth.persisted ? 'Storage Persisted (Safe)' : 'Temporary Storage (Risk)'}
      </span>
    )}
  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${storageHealth.isCritical ? 'bg-red-500' : storageHealth.isWarning ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, storageHealth.usagePercent)}%` }}
                  ></div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
              <span className="text-sm font-bold text-slate-700">Export data</span>
              <ExportMenu label="PDF / PNG" onPick={handleExportData} className="text-xs font-black uppercase bg-slate-900 text-white px-3 py-1.5 rounded-full active:scale-95" />
            </div>
            {isOwner && (
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 h-12">
                <span className="text-sm font-bold text-slate-700">Business day starts</span>
                <select aria-label="Business day starts" value={shopProfile?.dayCutoffMin ?? 270} onChange={handleCutoff} className="text-sm font-bold bg-white border border-slate-200 rounded-lg px-2 py-1">
                  {CUTOFF_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}
            {isOwner && (
              <button onClick={handleRecalculate} disabled={recalculating} className="w-full bg-slate-50 text-slate-700 font-bold h-12 rounded-xl border border-slate-200 active:bg-slate-100 transition-colors text-sm disabled:opacity-50">
                {recalculating ? 'Recalculating...' : 'Recalculate totals (last 90 days)'}
              </button>
            )}
            <button onClick={handleBackupJson} className="w-full bg-slate-50 text-slate-700 font-bold h-12 rounded-xl border border-slate-200 active:bg-slate-100 transition-colors text-sm">
              Backup file (JSON)
            </button>
            <button onClick={handleClearCache} className="w-full bg-slate-50 text-slate-700 font-bold h-12 rounded-xl border border-slate-200 active:bg-slate-100 transition-colors text-sm">
              Clear App Cache & Reload
            </button>
          </div>
        </section>

        {/* Account */}
        <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
           <div className="flex items-center gap-2 text-slate-900 font-bold mb-4">
             <User size={20} className="text-blue-600" />
             <h2>Account</h2>
           </div>
           <div className="flex items-center justify-between mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
             <div className="overflow-hidden">
               <p className="font-bold text-slate-900 text-sm truncate">{user?.email}</p>
               <p className="text-xs text-slate-500">Logged in via Google</p>
             </div>
           </div>
           <button onClick={handleSignOut} className="w-full bg-slate-100 text-slate-700 font-bold h-12 rounded-xl flex items-center justify-center gap-2 active:bg-slate-200 transition-colors">
             <LogOut size={18} /> Sign Out
           </button>

           <hr className="border-slate-100 my-4" />

           <div className="space-y-2">
             <p className="text-xs font-semibold text-red-600">Danger Zone</p>
             <button
               onClick={handleDeleteAccount}
               disabled={isDeletingAccount}
               className="w-full border border-red-200 text-red-600 font-bold h-12 rounded-xl flex items-center justify-center gap-2 active:bg-red-50 transition-colors disabled:opacity-50"
             >
               <Trash2 size={18} /> {isDeletingAccount ? 'Deleting...' : 'Delete Account Permanently'}
             </button>
           </div>
        </section>

        <div className="text-center text-xs text-slate-400 font-medium py-4">
          Ledgro PWA Version 1.0.0
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
