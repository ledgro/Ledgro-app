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

export default function Settings() {
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
  const [autoReset, setAutoReset] = useState(() => localStorage.getItem('ledgro_autoReset') !== 'false');

  useEffect(() => {
    const fetchShopProfile = async () => {
      if (!shopId) return;
      try {
        const docRef = doc(db, 'shops', shopId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
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
      alert("Shop profile saved!");
    } catch (err) {
      console.error(err);
      if (hapticFeedback) hapticVibrate([100, 50, 100]);
      alert("Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportData = async () => {
    if (!shopId) return;
    try {
      const billsRef = collection(db, `shops/${shopId}/bills`);
      const expensesRef = collection(db, `shops/${shopId}/expenses`);

      const [billsSnap, expensesSnap] = await Promise.all([getDocs(billsRef), getDocs(expensesRef)]);

      const rows = [['Date', 'Type', 'Amount', 'Payment Method', 'Items/Description', 'Status']];

      billsSnap.docs.forEach(d => {
        const b = d.data();
        const dateStr = b.createdAt?.toDate ? format(b.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : 'Pending';
        const itemsStr = b.items?.map(i => `${i.qty}x ${i.name}`).join('; ') || '';
        const methodStr = b.payment?.method === 'split' ? `Split (Cash: ${b.payment.breakdown.cash}, UPI: ${b.payment.breakdown.upi})` : b.paymentMethod;
        rows.push([dateStr, 'Sale', b.grandTotal, methodStr, itemsStr, b.type === 'reversal' ? 'Voided' : 'Active']);
      });

      expensesSnap.docs.forEach(d => {
        const e = d.data();
        const dateStr = e.createdAt?.toDate ? format(e.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : 'Pending';
        rows.push([dateStr, 'Expense', -e.amount, '-', e.description || e.categoryId, 'Active']);
      });

      const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `ledgro_export_${format(new Date(), 'yyyyMMdd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert("Failed to export data.");
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
