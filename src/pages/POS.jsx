import { toast } from 'sonner';
import { useReducer, useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { writeStats, voidEntries } from '../lib/dayStats';
import { billDelta, bizDayKey } from '../lib/statsMath';
import { serverNow, CLOCK_MSG } from '../lib/clockDrift';
import { collection, getDocs, getDoc, writeBatch, doc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Tag, ArrowRight, Share2, PlusCircle, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSpring, animated } from '@react-spring/web';

import SearchInput from '../components/SearchInput';
import CartItem from '../components/CartItem';
import DiscountDrawer from '../components/DiscountDrawer';
import Receipt from '../components/Receipt';
import { billReducer, initialBillState, calculateBillTotals } from '../reducers/billReducer';
import BottomNav from '../components/BottomNav';

import { useLocation, useNavigate } from 'react-router-dom';
import { hapticVibrate, sanitizeText } from '../lib/utils';
import { shareFile, saveFile, canvasToBlob, canvasToPdfBlob } from '../lib/shareFile';

const COMMIT_TIMEOUT_MS = 15000;
const normName = (s) => String(s || '').normalize('NFC').trim().toLowerCase();

// Bill numbers must not collide across devices: uid prefix + per-device tag + daily counter.
function getDeviceTag() {
  try {
    let tag = localStorage.getItem('ledgro_device_tag');
    if (!tag) {
      tag = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => (b % 36).toString(36)).join('').toUpperCase();
      localStorage.setItem('ledgro_device_tag', tag);
    }
    return tag;
  } catch {
    return 'ZZ';
  }
}

function generateBillNumber(uid) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dateKey = `billSeq_${dd}${mm}${now.getFullYear()}`;

  const current = parseInt(localStorage.getItem(dateKey) || '0') + 1;
  localStorage.setItem(dateKey, current.toString());

  const prefix = uid ? uid.slice(0, 2).toUpperCase() : 'XX';
  const seq = String(current).padStart(3, '0');

  return `${prefix}${getDeviceTag()}-${dd}${mm}-${seq}`;
}

export default function POS() {
  const { user, shopId, shopName, shopProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const hydrateCatalog = useCatalogStore((s) => s.hydrateCatalog);
  const addCatalogItem = useCatalogStore((s) => s.addItem);

  const [state, dispatch] = useReducer(billReducer, initialBillState);
  const isSubmittingRef = useRef(false);
  // Same bill doc id is reused if a slow commit is retried, so a bill can never be saved twice.
  const pendingBillRefRef = useRef(null);
  const timedOutRef = useRef(false);
  const receiptRef = useRef(null);

  // Checkout state (declared before any effect/hook that reads it)
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [lastBill, setLastBill] = useState(null);
  const [receiptFormat, setReceiptFormat] = useState('png'); // 'png' | 'pdf'
  const [receiptFiles, setReceiptFiles] = useState(null); // pre-rendered { png, pdf } blobs
  const [paymentMethod, setPaymentMethod] = useState(() => (localStorage.getItem('ledgro_defaultPayment') === 'upi' ? 'upi' : 'cash')); // 'cash' | 'upi' | 'split'
  const [splitCash, setSplitCash] = useState('');

  const { items, subtotal, globalDiscountAmt, grandTotal } = useMemo(() => calculateBillTotals(state), [state]);

  // Identity + live cart for the update/recovery logic in main.jsx and ErrorBoundary
  useEffect(() => {
    window.__LEDGRO_UID__ = user?.uid;
    window.__LEDGRO_SHOPID__ = shopId;
  }, [user?.uid, shopId]);

  useEffect(() => {
    window.__LEDGRO_CART_STATE__ = state;
    window.__LEDGRO_CHECKOUT_ACTIVE__ = isCheckingOut;
  }, [state, isCheckingOut]);

  useEffect(() => () => {
    // leaving the POS screen: nothing is "in progress" any more
    window.__LEDGRO_CART_STATE__ = null;
    window.__LEDGRO_CHECKOUT_ACTIVE__ = false;
  }, []);

  // Restore a cart saved just before an update-reload
  useEffect(() => {
    const recovered = localStorage.getItem('ledgro-cart-recovery');
    if (!recovered) return;
    try {
      const { cartState, savedAt, uid, shopId: savedShopId } = JSON.parse(recovered);
      localStorage.removeItem('ledgro-cart-recovery');
      // Only restore if it belongs to the current user and shop
      if (uid !== user?.uid || savedShopId !== shopId) return;
      const ageMs = Date.now() - new Date(savedAt).getTime();
      if (ageMs < 5 * 60 * 1000 && cartState?.items?.length) { // Only restore if less than 5 mins old
        dispatch({ type: 'INIT_FROM_EDIT', payload: { items: cartState.items, globalDiscount: cartState.globalDiscount } });
        toast.success('Cart restored after app update');
      }
    } catch {
      localStorage.removeItem('ledgro-cart-recovery');
    }
  }, [user?.uid, shopId]);

  const springTotal = useSpring({ val: grandTotal, config: { stiffness: 200, damping: 20 } });
  const editBill = location.state?.editBill || null;

  // Init from edit
  useEffect(() => {
    if (editBill && state.items.length === 0 && !checkoutSuccess) {
      dispatch({ type: 'INIT_FROM_EDIT', payload: editBill });

      // If it was a split payment, re-initialize the split UI
      if (editBill.payment?.method === 'split') {
        setPaymentMethod('split');
        setSplitCash(((editBill.payment.breakdown?.cash || 0) / 100).toString());
      } else {
        setPaymentMethod(editBill.paymentMethod || 'cash');
      }

      // Clear location state so refresh doesn't trigger edit mode again
      window.history.replaceState({}, document.title);
    }
  }, [editBill, state.items.length, checkoutSuccess]);

  // Load catalog on mount
  useEffect(() => {
    const fetchCatalog = async () => {
      if (!shopId) return;
      try {
        const snap = await getDocs(collection(db, `shops/${shopId}/catalog`));
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        hydrateCatalog(loaded);
      } catch (err) {
        console.error('Failed to load catalog', err);
      }
    };
    fetchCatalog();
  }, [hydrateCatalog, shopId]);

  // Drawer state
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [activeDiscountItem, setActiveDiscountItem] = useState(null); // null means global discount

  // Derive top 8 most frequent active items for fast-access grid
  const storeCatalogItems = useCatalogStore((s) => s.items);
  const fastAccessItems = useMemo(() => {
    return storeCatalogItems
      .filter((i) => i.id && i.isActive !== false)
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .slice(0, 8);
  }, [storeCatalogItems]);

  const handleAddItem = (item) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
    if (localStorage.getItem('ledgro_haptic') !== 'false') {
      hapticVibrate(10);
    }
    // Remember typed items locally so they show up in search straight away.
    // The catalog document itself is created at checkout (together with the bill).
    if (!item.catalogId) {
      addCatalogItem({ name: item.name, lastUsedPrice: item.unitPriceAtSale, unit: item.unit || 'piece' });
    }
  };

  const openLineDiscount = (item) => {
    setActiveDiscountItem(item);
    setIsDiscountOpen(true);
  };

  const openGlobalDiscount = () => {
    setActiveDiscountItem(null);
    setIsDiscountOpen(true);
  };

  const handleCheckout = async () => {
    if (items.length === 0 || !shopId || isSubmittingRef.current) return;

    // Split payment sanity
    const cashPaise = paymentMethod === 'split' ? Math.round((parseFloat(splitCash) || 0) * 100) : 0;
    if (paymentMethod === 'split' && (cashPaise <= 0 || cashPaise >= grandTotal)) {
      toast.error('Enter a cash amount between 0 and the bill total.');
      return;
    }

    const catalogItems = useCatalogStore.getState().items;
    const catalogMap = new Map(catalogItems.filter((c) => c.id).map((c) => [c.id, c]));
    const catalogByName = new Map(catalogItems.filter((c) => c.id).map((c) => [normName(c.name), c]));

    // 1. Resolve every cart line to a catalog document (existing, or one to create)
    const newCatalog = new Map(); // normalized name -> { id, ref, name, price, unit }
    const resolved = items.map((line) => {
      let catalogId = line.catalogId && catalogMap.has(line.catalogId) ? line.catalogId : null;
      if (!catalogId) {
        const key = normName(line.name);
        const existing = catalogByName.get(key);
        if (existing) {
          catalogId = existing.id;
        } else {
          let fresh = newCatalog.get(key);
          if (!fresh) {
            const ref = doc(collection(db, `shops/${shopId}/catalog`));
            fresh = { id: ref.id, ref, name: String(line.name).slice(0, 100), price: line.unitPriceAtSale, unit: line.unit || 'unit' };
            newCatalog.set(key, fresh);
          }
          catalogId = fresh.id;
        }
      }
      return { ...line, catalogId };
    });

    // 2. Aggregate per catalog doc (several cart lines can share one product)
    const soldQty = new Map();
    resolved.forEach((l) => soldQty.set(l.catalogId, (soldQty.get(l.catalogId) || 0) + (Number(l.qty) || 0)));

    // Stock never blocks a sale: shops often sell items they haven't entered stock for
    // (or borrow from another branch). Tracked stock simply floors at 0.

    setIsCheckingOut(true);
    isSubmittingRef.current = true;

    try {
      const paymentData = {
        method: paymentMethod,
        breakdown: {
          cash: paymentMethod === 'split' ? cashPaise : (paymentMethod === 'cash' ? grandTotal : 0),
          upi: paymentMethod === 'split' ? grandTotal - cashPaise : (paymentMethod === 'upi' ? grandTotal : 0),
        },
      };

      // Snapshot the bill (no undefined values: Firestore rejects them)
      const payload = {
        creatorId: user.uid,
        items: resolved.map((i) => ({
          name: sanitizeText(i.name),
          catalogId: i.catalogId,
          unit: i.unit || 'unit',
          unitPrice: i.unitPriceAtSale,
          qty: i.qty,
          rawTotal: i.rawTotal,
          lineDiscount: i.lineDiscount,
          finalLineTotal: i.finalLineTotal,
        })),
        subtotal,
        globalDiscount: state.globalDiscount,
        globalDiscountAmt,
        grandTotal,
        paymentMethod, // legacy string, keeping for backwards compatibility
        payment: paymentData,
        shopName: shopName || '',
        billNo: generateBillNumber(user.uid),
        clientCreatedAt: new Date().toISOString(),
        createdAt: serverTimestamp(), // critical for offline ledger ordering
      };

      const batch = writeBatch(db);
      if (!pendingBillRefRef.current) pendingBillRefRef.current = doc(collection(db, `shops/${shopId}/bills`));
      const newBillRef = pendingBillRefRef.current;
      batch.set(newBillRef, payload);
      const statEntries = [{ key: bizDayKey(await serverNow()), delta: billDelta(payload) }];

      // Stock/frequency bookkeeping, one write per catalog doc
      const stockDelta = new Map(); // id -> signed change
      soldQty.forEach((qty, id) => stockDelta.set(id, -qty));

      // Editing a bill voids the original and returns its stock
      if (editBill) {
        statEntries.push(...(await voidEntries(shopId, editBill)));
        batch.update(doc(db, `shops/${shopId}/bills`, editBill.id), {
          type: 'reversal',
          originalBillId: editBill.id,
          reversedBy: user.uid,
          reversedAt: serverTimestamp(),
        });
        (editBill.items || []).forEach((old) => {
          if (old.catalogId && catalogMap.has(old.catalogId)) {
            stockDelta.set(old.catalogId, (stockDelta.get(old.catalogId) || 0) + (Number(old.qty) || 0));
          }
        });
      }

      const localCatalogUpdates = [];
      const touched = new Set([...soldQty.keys(), ...stockDelta.keys()]);
      touched.forEach((id) => {
        const cat = catalogMap.get(id);
        if (!cat) return; // brand-new product, created below
        const updates = {};
        if (!editBill && soldQty.has(id)) updates.frequency = increment(1);
        let delta = stockDelta.get(id) || 0;
        if (cat.stockCount != null && delta < 0) delta = Math.max(delta, -Math.max(0, cat.stockCount)); // floor at 0
        if (cat.stockCount != null && delta !== 0) updates.stockCount = increment(delta);
        if (Object.keys(updates).length > 0) {
          batch.update(doc(db, `shops/${shopId}/catalog`, id), updates);
          localCatalogUpdates.push({
            id,
            name: cat.name,
            ...(updates.frequency ? { frequency: (cat.frequency || 0) + 1 } : {}),
            ...(updates.stockCount ? { stockCount: cat.stockCount + delta } : {}),
          });
        }
      });

      // Brand-new products typed at the till
      newCatalog.forEach((fresh) => {
        batch.set(fresh.ref, {
          name: fresh.name,
          lastUsedPrice: fresh.price,
          unit: fresh.unit,
          isActive: true,
          frequency: editBill ? 0 : 1,
          stockCount: null,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      writeStats(batch, shopId, statEntries);

      // Online-only: wait for the server's verdict. A bill is NEVER shown as success unless
      // the server accepted it. The same bill id is reused on retry, so no duplicates.
      if (!navigator.onLine) throw new Error('OFFLINE');
      // After a timeout the first attempt may have landed. If the bill exists, do not write again.
      let alreadySaved = false;
      if (timedOutRef.current) {
        try { alreadySaved = (await getDoc(newBillRef)).exists(); } catch { /* treat as not saved */ }
      }
      if (!alreadySaved) {
        await Promise.race([
          batch.commit(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), COMMIT_TIMEOUT_MS)),
        ]);
      }
      pendingBillRefRef.current = null;
      timedOutRef.current = false;

      // Keep the local catalog in step with what we just wrote
      localCatalogUpdates.forEach((u) => addCatalogItem(u));
      newCatalog.forEach((fresh) => addCatalogItem({
        id: fresh.id, name: fresh.name, lastUsedPrice: fresh.price, unit: fresh.unit, isActive: true, frequency: editBill ? 0 : 1, stockCount: null,
      }));

      if (localStorage.getItem('ledgro_haptic') !== 'false') {
        hapticVibrate([50, 30, 50]);
      }

      dispatch({ type: 'CLEAR_BILL' });
      setSplitCash('');
      setLastBill({ ...payload, shopProfile });
      setCheckoutSuccess(true);
      const bCount = parseInt(localStorage.getItem('ledgro-billCount') || '0');
      localStorage.setItem('ledgro-billCount', (bCount + 1).toString());
    } catch (err) {
      console.error('Checkout failed:', err);
      if (localStorage.getItem('ledgro_haptic') !== 'false') {
        hapticVibrate([100, 50, 100]);
      }
      // cart is untouched, so the cashier can simply try again
      if (err?.message === 'OFFLINE') {
        toast.error('You are offline. Reconnect, then tap Checkout again. Nothing was saved.');
      } else if (err?.message === 'CLOCK') {
        toast.error(CLOCK_MSG);
      } else if (err?.message === 'TIMEOUT') {
        timedOutRef.current = true;
        toast.error('Slow connection. The bill may still go through. Check Ledger before tapping Checkout again.', { duration: 8000 });
      } else {
        pendingBillRefRef.current = null;
        timedOutRef.current = false;
        toast.error('Checkout failed. Nothing was charged. Please try again.');
      }
    } finally {
      setIsCheckingOut(false);
      isSubmittingRef.current = false;
    }
  };

  // Render the receipt ONCE as soon as the success screen shows. iOS only opens the
  // share sheet inside a tap, so the files must already exist when the user taps.
  useEffect(() => {
    if (!checkoutSuccess || !lastBill) { setReceiptFiles(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!receiptRef.current) return;
      try {
        const { default: html2canvas } = await import('html2canvas-pro');
        const canvas = await html2canvas(receiptRef.current, {
          scale: Math.min(window.devicePixelRatio || 2, 3),
          useCORS: true, backgroundColor: '#ffffff', width: 720, logging: false,
        });
        const png = await canvasToBlob(canvas);
        const pdf = await canvasToPdfBlob(canvas);
        canvas.width = 0; canvas.height = 0;
        if (!cancelled) setReceiptFiles({ png, pdf });
      } catch (err) {
        console.error(err);
        if (!cancelled) setReceiptFiles({ error: true });
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [checkoutSuccess, lastBill]);

  const receiptName = () => `ledgro-receipt-${(lastBill?.billNo || 'bill').replace(/[^\w-]/g, '')}.${receiptFormat}`;

  const shareReceipt = async () => {
    const blob = receiptFiles?.[receiptFormat];
    if (!blob) { toast.error(receiptFiles?.error ? 'Could not create the receipt.' : 'Receipt still preparing…'); return; }
    // no await before this call: keeps the tap's user-activation alive on iOS
    const r = await shareFile(blob, receiptName(), `Receipt from ${shopName || 'shop'}`);
    if (r === 'unsupported') {
      await saveFile(blob, receiptName());
      toast.info('Sharing not supported here. Receipt saved instead.');
    }
  };

  const downloadReceipt = async () => {
    const blob = receiptFiles?.[receiptFormat];
    if (!blob) { toast.error(receiptFiles?.error ? 'Could not create the receipt.' : 'Receipt still preparing…'); return; }
    await saveFile(blob, receiptName(), 'Save receipt');
  };

  const handleNewBill = () => {
    setCheckoutSuccess(false);
    setLastBill(null);
    dispatch({ type: 'CLEAR_BILL' });
    navigate('.', { replace: true, state: {} });
    // let a pending app update install now that the sale is fully finished
    window.dispatchEvent(new Event('ledgro:checkout-complete'));
  };

  if (checkoutSuccess) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
        <Receipt ref={receiptRef} billData={lastBill} />

        <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-sm w-full z-10">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Checkout Successful</h2>
          <p className="text-gray-500 mb-8 font-medium">₹{lastBill?.grandTotal ? (lastBill.grandTotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : 0} collected via {lastBill?.paymentMethod?.toUpperCase()}</p>

          <div className="space-y-3">
            <div className="flex bg-slate-100 p-1 rounded-xl" role="group" aria-label="Receipt format">
              {['png', 'pdf'].map((f) => (
                <button key={f} type="button" onClick={() => setReceiptFormat(f)}
                  className={`flex-1 py-2 text-sm font-black uppercase rounded-lg transition-colors ${receiptFormat === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={shareReceipt}
              disabled={!receiptFiles || receiptFiles.error}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Share2 size={20} /> {receiptFiles ? 'Share' : 'Preparing…'}
            </button>
            <button
              onClick={downloadReceipt}
              disabled={!receiptFiles || receiptFiles.error}
              className="w-full bg-white border border-slate-200 text-slate-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <Download size={20} /> {/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'Save (Files / Photos)' : 'Download'}
            </button>
            <button
              onClick={handleNewBill}
              className="w-full bg-gray-100 text-gray-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 active:bg-gray-300 transition-colors mt-4"
            >
              <PlusCircle size={20} /> Done (New Bill)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-y-auto bg-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">{editBill ? 'Correct & Edit Bill' : 'New Bill'}</h1>
      </header>

      {editBill && !checkoutSuccess && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 text-xs font-semibold text-orange-800 text-center">
          You are editing an existing bill. Saving will void the original.
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col pb-40"> {/* pb-40 ensures we don't hide behind sticky footer */}
        <div className="p-4 pb-2 sticky top-[60px] z-20 bg-white/80 backdrop-blur-md">
          <SearchInput onAddItem={handleAddItem} />
        </div>

        {/* Fast-Access Pinned Grid */}
        {fastAccessItems.length > 0 && (
          <div className="px-4 pb-4 overflow-x-auto no-scrollbar">
            <div className="flex gap-2">
              {fastAccessItems.map((fItem) => (
                <button
                  key={fItem.id}
                  onClick={() => handleAddItem({
                    name: fItem.name,
                    unitPriceAtSale: fItem.lastUsedPrice || 0,
                    catalogVersionTimestamp: fItem.updatedAt?.toMillis?.() || Date.now(),
                    catalogId: fItem.id,
                    qty: 1,
                    unit: fItem.unit || 'unit',
                  })}
                  className="flex-shrink-0 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 flex flex-col items-center justify-center active:bg-blue-100 transition-colors shadow-sm"
                  style={{ minWidth: '100px' }}
                >
                  <span className="font-bold text-slate-800 text-sm truncate w-full text-center">{fItem.name}</span>
                  <span className="text-blue-600 font-bold text-xs mt-0.5">₹{((fItem.lastUsedPrice || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 flex-1 mt-2">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 mt-20">
              <p>Search or add an item to begin</p>
            </div>
          ) : (
            <div className="flex flex-col">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35, duration: 0.2 }}
                  >
                    <CartItem
                      item={item}
                      dispatch={dispatch}
                      onOpenDiscount={openLineDiscount}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Sticky Bottom Bar Checkout (Stacked above BottomNav) */}
      {items.length > 0 && (
        <div className="fixed bottom-[64px] left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30 pb-safe">
          <div className="p-4 max-w-md mx-auto">
            {/* Totals Breakdown */}
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-900">{items.length}</span> items
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={openGlobalDiscount}
                  className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md flex items-center gap-1"
                >
                  <Tag size={12} />
                  Bill Discount
                </button>
                <div className="text-right">
                  {globalDiscountAmt > 0 && (
                    <span className="text-xs text-gray-400 line-through block leading-none mb-0.5">
                      ₹{(subtotal / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  )}
                  <animated.span className="text-2xl font-bold text-gray-900 leading-none">
                    {springTotal.val.to((val) => `₹${(Math.round(val) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`)}
                  </animated.span>
                </div>
              </div>
            </div>

            {/* Checkout Actions & Payment Toggle */}
            <div className="flex flex-col gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {['cash', 'upi', 'split'].map((method) => (
                  <button
                    key={method}
                    onClick={() => {
                      setPaymentMethod(method);
                      if (method !== 'split') setSplitCash(''); // reset
                    }}
                    className={`flex-1 py-2 text-sm font-bold uppercase tracking-wider rounded-lg transition-all ${
                      paymentMethod === method ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>

              {/* Split Payment UI */}
              {paymentMethod === 'split' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Cash Received</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                        className="w-full pl-7 pr-3 h-12 border border-green-200 bg-green-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 font-bold text-green-700"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">UPI Remaining</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                      <input
                        type="number"
                        disabled
                        value={Math.max(0, (grandTotal / 100) - (parseFloat(splitCash) || 0))}
                        className="w-full pl-7 pr-3 h-12 border border-slate-200 bg-slate-100 rounded-xl font-bold text-slate-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isCheckingOut || (paymentMethod === 'split' && (!splitCash || Math.round(parseFloat(splitCash) * 100) >= grandTotal))}
                className="w-full bg-blue-600 text-white font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm mt-1"
              >
                {isCheckingOut ? 'Processing...' : 'Confirm Checkout'} <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Drawer */}
      <DiscountDrawer
        isOpen={isDiscountOpen}
        onClose={() => setIsDiscountOpen(false)}
        targetItem={activeDiscountItem}
        globalDiscount={state.globalDiscount}
        dispatch={dispatch}
      />

      <BottomNav />
    </div>
  );
}
