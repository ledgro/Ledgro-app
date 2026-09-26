import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Store, Settings2, Database, User, LogOut, ChevronLeft, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hapticVibrate } from '../lib/utils';
import { getDocs, collection } from 'firebase/firestore';
import { format } from 'date-fns';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/"/g, '""');
}

export default function Settings() {
  const billCount = parseInt(localStorage.getItem('ledgro-billCount') || '0');
  const { user, shopId, signOut } = useAuth();
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
  const [theme, setTheme] = useState(() => localStorage.getItem('ledgro-theme') || 'system');
  const [autoReset, setAutoReset] = useState(() => localStorage.getItem('ledgro_autoReset') !== 'false');




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
      } catch (err) {
        console.error("Failed to load shop profile", err);
      }
    };
    fetchShopProfile();
  }, [shopId]);

  // Sync preferences to localStorage

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('ledgro-theme', newTheme);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (newTheme === 'dark' || (newTheme === 'system' && prefersDark)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  };

  useEffect(() => {
    localStorage.setItem('ledgro_defaultPayment', defaultPayment);
    localStorage.setItem('ledgro_haptic', hapticFeedback);
    localStorage.setItem('ledgro_autoReset', autoReset);
  }, [defaultPayment, hapticFeedback, autoReset]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!shopId || !shopName.trim()) return;
    setSavingProfile(true);
    try {
      const docRef = doc(db, 'shops', shopId);
      await updateDoc(docRef, {
        name: shopName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        tagline: tagline.trim(),
        updatedAt: new Date()
      });
      if (hapticFeedback) hapticVibrate([50, 30, 50]);
      toast("Shop profile saved!");
    } catch (err) {
      console.error(err);
      if (hapticFeedback) hapticVibrate([100, 50, 100]);
      toast.error("Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportData = async () => {
    if (!shopId) return;

    try {
      const billsSnap = await getDocs(collection(db, `shops/${shopId}/bills`));
      const expSnap = await getDocs(collection(db, `shops/${shopId}/expenses`));

      // 1. Bills CSV
      const billHeaders = "Bill Number,Date,Time,Items,Subtotal,Discount,Grand Total,Payment Method,Cash Amount,UPI Amount,Created By,Status";
      const billRows = [billHeaders];

      const rawBills = [];
      billsSnap.forEach(doc => {
         const data = doc.data({ serverTimestamps: 'estimate' });
         rawBills.push({...data, id: doc.id});

         const date = data.createdAt?.toDate ? format(data.createdAt.toDate(), 'yyyy-MM-dd') : '';
         const time = data.createdAt?.toDate ? format(data.createdAt.toDate(), 'HH:mm:ss') : '';
         const items = data.items ? data.items.map(i => `${i.name} (${i.qty})`).join(';') : '';

         let cashAmt = 0;
         let upiAmt = 0;
         const pMethod = data.paymentMethod || data.payment?.method || data.refundMethod || 'unknown';
         if (pMethod === 'split' && data.payment?.breakdown) {
            cashAmt = data.payment.breakdown.cash;
            upiAmt = data.payment.breakdown.upi;
         } else if (pMethod === 'upi') {
            upiAmt = data.grandTotal;
         } else {
            cashAmt = data.grandTotal;
         }

         const status = data.isVoided ? 'voided' : (data.type || 'active');

         billRows.push(`"${csvEscape(data.billNo || data.id)}","${date}","${time}","${csvEscape(items)}",${data.subtotal || 0},${data.globalDiscountAmt || 0},${data.grandTotal || 0},"${csvEscape(pMethod)}",${cashAmt},${upiAmt},"${csvEscape(data.creatorId)}","${csvEscape(status)}"`);
      });

      // 2. Expenses CSV
      const expHeaders = "Date,Description,Category,Amount,Created By";
      const expRows = [expHeaders];
      const rawExp = [];
      expSnap.forEach(doc => {
         const data = doc.data({ serverTimestamps: 'estimate' });
         rawExp.push({...data, id: doc.id});
         const date = data.createdAt?.toDate ? format(data.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : '';
         expRows.push(`"${date}","${csvEscape(data.description || '')}","${csvEscape(data.category || '')}",${data.amount || 0},"${csvEscape(data.creatorId || '')}"`);
      });

      const downloadFile = (content, filename, type) => {
         const blob = new Blob([content], { type: type });
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = filename;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         window.URL.revokeObjectURL(url);
      };

      // Download Sequentially
      downloadFile(billRows.join('\n'), `ledgro_bills_${Date.now()}.csv`, 'text/csv');

      setTimeout(() => {
         downloadFile(expRows.join('\n'), `ledgro_expenses_${Date.now()}.csv`, 'text/csv');
      }, 1000);

      setTimeout(() => {
         const rawData = JSON.stringify({ bills: rawBills, expenses: rawExp }, null, 2);
         downloadFile(rawData, `ledgro_backup_${Date.now()}.json`, 'application/json');
      }, 2000);

    } catch (err) {
      console.error(err);
      toast.error("Failed to export data.");
    }
  };

  const handleClearCache = async () => {
    if (window.confirm("This will clear local app cache and reload the app. Unsaved offline data may be lost. Continue?")) {
      // Typically indexedDB is managed by Firebase, reloading is the safest cache clear for PWA Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }
      window.location.reload(true);
    }
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
              <input type="text" required value={shopName} onChange={(e) => setShopName(e.target.value)} className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Phone Number</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Receipt Footer Tagline</label>
              <input type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Thank you for shopping with us!" className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium" />
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
            <button onClick={handleExportData} className="w-full bg-slate-50 text-slate-700 font-bold h-12 rounded-xl border border-slate-200 active:bg-slate-100 transition-colors">
              Export All Data to CSV
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
           <button onClick={signOut} className="w-full bg-red-50 text-red-600 font-bold h-12 rounded-xl flex items-center justify-center gap-2 active:bg-red-100 transition-colors">
             <LogOut size={18} /> Sign Out
           </button>
        </section>

        <div className="text-center text-xs text-slate-400 font-medium py-4">
          Ledgro PWA Version 1.0.0
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
