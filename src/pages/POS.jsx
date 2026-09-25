import { useReducer, useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { collection, addDoc, serverTimestamp, getDocs, writeBatch, doc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { Tag, ArrowRight, Share2, PlusCircle, Download } from 'lucide-react';

import SearchInput from '../components/SearchInput';
import CartItem from '../components/CartItem';
import DiscountDrawer from '../components/DiscountDrawer';
import Receipt from '../components/Receipt';
import { billReducer, initialBillState, calculateBillTotals } from '../reducers/billReducer';
import BottomNav from '../components/BottomNav';
import html2canvas from 'html2canvas-pro';

import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hapticVibrate } from '../lib/utils';

function generateBillNumber(uid) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dateKey = `billSeq_${dd}${mm}${now.getFullYear()}`;

  const current = parseInt(localStorage.getItem(dateKey) || '0') + 1;
  localStorage.setItem(dateKey, current.toString());

  const prefix = uid ? uid.slice(0, 2).toUpperCase() : 'XX';
  const seq = String(current).padStart(3, '0');

  return `${prefix}-${dd}${mm}-${seq}`;
}

export default function POS() {
  const { user, shopId, shopName, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const hydrateCatalog = useCatalogStore((state) => state.hydrateCatalog);
  const addCatalogItem = useCatalogStore((state) => state.addItem);

  const [state, dispatch] = useReducer(billReducer, initialBillState);
  const receiptRef = useRef(null);
  const springTotal = useSpring(grandTotal, { stiffness: 200, damping: 20 });

  // Drawer state
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [activeDiscountItem, setActiveDiscountItem] = useState(null); // null means global discount

  // Checkout state
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isFirstBillDrawerOpen, setIsFirstBillDrawerOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [lastBill, setLastBill] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'upi' | 'split'
  const [splitCash, setSplitCash] = useState('');


  const editBill = location.state?.editBill || null;

  // Init from edit
  useEffect(() => {
    if (editBill && state.items.length === 0 && !checkoutSuccess) {
      dispatch({ type: 'INIT_FROM_EDIT', payload: editBill });


      // If it was a split payment, re-initialize the split UI
      if (editBill.payment?.method === 'split') {
         setPaymentMethod('split');
         setSplitCash(editBill.payment.breakdown.cash.toString());
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
        // Querying the specific shop's subcollection for catalog items
        const catalogRef = collection(db, `shops/${shopId}/catalog`);
        const snap = await getDocs(catalogRef);
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        hydrateCatalog(items);
      } catch (err) {
        console.error("Failed to load catalog", err);
      }
    };
    fetchCatalog();
  }, [hydrateCatalog, shopId]);

  const { items, subtotal, globalDiscountAmt, grandTotal } = useMemo(() => calculateBillTotals(state), [state]);

  // Derive top 8 most frequent active items for fast-access grid
  const fastAccessItems = useMemo(() => {
    const catalogItems = useCatalogStore.getState().items;
    return catalogItems
      .filter(i => i.isActive !== false)
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .slice(0, 8);
  }, [state.items.length]); // Re-evaluate occasionally or on mount

  const handleAddItem = (item) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
    if (localStorage.getItem('ledgro_haptic') !== 'false') {
      hapticVibrate(10);
    }

    // Optimistically add to local catalog store so it's instantly available next time
    addCatalogItem({ name: item.name, lastUsedPrice: item.unitPrice });

    // Asynchronously add to Firestore catalog collection scoped by shopId
    if (shopId) {
      addDoc(collection(db, `shops/${shopId}/catalog`), {
        name: item.name,
        lastUsedPrice: item.unitPrice,
        addedBy: user.uid
      }).catch(console.error); // fire and forget
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
    if (items.length === 0 || !shopId) return;
    setIsCheckingOut(true);

    try {
      // Calculate split amounts if applicable
      const cashReceived = parseFloat(splitCash) || 0;
      const upiAmount = Math.max(0, grandTotal - cashReceived);


      const paymentData = {
        method: paymentMethod,
        breakdown: {
          cash: paymentMethod === 'split' ? cashReceived : (paymentMethod === 'cash' ? grandTotal : 0),
          upi: paymentMethod === 'split' ? upiAmount : (paymentMethod === 'upi' ? grandTotal : 0)
        }
      };

      // Snapshot the bill
      const payload = {
        creatorId: user.uid,
        items: items.map(i => ({
          name: i.name,
          unitPrice: i.unitPrice,
          qty: i.qty,
          rawTotal: i.rawTotal,
          lineDiscount: i.lineDiscount,
          finalLineTotal: i.finalLineTotal
        })),
        subtotal,
        globalDiscount: state.globalDiscount,
        globalDiscountAmt,
        grandTotal,
        paymentMethod, // legacy string, keeping for backwards compatibility
        payment: paymentData,
        shopName, // Pass the actual shop name to the receipt
        billNo: generateBillNumber(user.uid),
        createdAt: serverTimestamp() // critical for offline ledger ordering
      };

      const batch = writeBatch(db);

      const newBillRef = doc(collection(db, `shops/${shopId}/bills`));
      batch.set(newBillRef, payload);

      // If editing, insert a reversal document for the original bill
      if (editBill) {
        const reversalRef = doc(collection(db, `shops/${shopId}/bills`));
        batch.set(reversalRef, {
          type: 'reversal',
          originalBillId: editBill.id,
          creatorId: user.uid,
          grandTotal: -Math.abs(editBill.grandTotal),
          createdAt: serverTimestamp()
        });
      }

      // Update catalog: Decrement stock (if tracked) and increment frequency
      state.items.forEach(item => {
        if (item.catalogId) {
           const catalogItem = useCatalogStore.getState().items.find(i => i.id === item.catalogId);
           if (catalogItem) {
              const catalogRef = doc(db, `shops/${shopId}/catalog`, item.catalogId);
              const updates = { frequency: increment(1) };
              if (catalogItem.stockCount != null) {
                 updates.stockCount = increment(-item.qty);
              }
              batch.update(catalogRef, updates);
           }
        }
      });

      await batch.commit();

      if (localStorage.getItem('ledgro_haptic') !== 'false') {
        hapticVibrate([50, 30, 50]);
      }

      setLastBill(payload);
      setCheckoutSuccess(true);
      const bCount = parseInt(localStorage.getItem('ledgro-billCount') || '0');
      localStorage.setItem('ledgro-billCount', (bCount + 1).toString());

    } catch (err) {
      console.error("Checkout failed:", err);
      if (localStorage.getItem('ledgro_haptic') !== 'false') {
        hapticVibrate([100, 50, 100]);
      }
      alert("Checkout failed. Check console.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const generateReceiptImage = async () => {
    if (!receiptRef.current) return null;
    const canvas = await html2canvas(receiptRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 720,
      logging: false
    });

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    // Dispose canvas to prevent memory leak
    canvas.width = 0;
    canvas.height = 0;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, 0, 0);

    return blob;
  };

  const shareReceipt = async () => {
    const blob = await generateReceiptImage();
    if (!blob) return;

    const file = new File([blob], 'ledgro-receipt.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Receipt from ${shopName}`
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    const text = encodeURIComponent(`Receipt from ${shopName} via Ledgro`);
    const url = `https://wa.me/?text=${text}`;
    if (url.length <= 2048) window.open(url, '_blank');
  };

  const downloadReceipt = async () => {
    const blob = await generateReceiptImage();
    if (!blob) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());

    if (isIOS) {
      const file = new File([blob], 'ledgro-receipt.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Save Receipt' }); } catch(e) {}
      }
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ledgro-receipt.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNewBill = () => {
    setCheckoutSuccess(false);
    setLastBill(null);
    dispatch({ type: 'CLEAR_BILL' });
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
          <p className="text-gray-500 mb-8 font-medium">₹{lastBill?.grandTotal} collected via {lastBill?.paymentMethod?.toUpperCase()}</p>

          <div className="space-y-3">
            <button
              onClick={shareReceipt}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:bg-indigo-700 transition-colors"
            >
              <Share2 size={20} /> Share via WhatsApp
            </button>
            <button
              onClick={downloadReceipt}
              className="w-full bg-white border border-slate-200 text-slate-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <Download size={20} /> {/iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase()) ? 'Save to Photos' : 'Download'}
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
              {fastAccessItems.map(fItem => (
                <button
                  key={fItem.id}
                  onClick={() => handleAddItem({ name: fItem.name, unitPrice: fItem.lastUsedPrice || 0, catalogId: fItem.id, qty: 1 })}
                  className="flex-shrink-0 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 flex flex-col items-center justify-center active:bg-blue-100 transition-colors shadow-sm"
                  style={{ minWidth: '100px' }}
                >
                  <span className="font-bold text-slate-800 text-sm truncate w-full text-center">{fItem.name}</span>
                  <span className="text-blue-600 font-bold text-xs mt-0.5">₹{fItem.lastUsedPrice}</span>
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
                {items.map(item => (
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
                      ₹{subtotal}
                    </span>
                  )}
                  <animated.span className="text-2xl font-bold text-gray-900 leading-none">
                    {springTotal.to(val => `₹${Math.round(val).toLocaleString('en-IN')}`)}
                  </animated.span>
                </div>
              </div>
            </div>

            {/* Checkout Actions & Payment Toggle */}
            <div className="flex flex-col gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {['cash', 'upi', 'split'].map(method => (
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
                        value={Math.max(0, grandTotal - (parseFloat(splitCash) || 0))}
                        className="w-full pl-7 pr-3 h-12 border border-slate-200 bg-slate-100 rounded-xl font-bold text-slate-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleCheckout}
                disabled={isCheckingOut || (paymentMethod === 'split' && (!splitCash || parseFloat(splitCash) >= grandTotal))}
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
        dispatch={dispatch}
      />

            <Drawer.Root open={isFirstBillDrawerOpen} onOpenChange={setIsFirstBillDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-white flex flex-col rounded-t-[24px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-50 focus:outline-none">
            <div className="p-8 bg-white rounded-t-[24px] flex flex-col items-center pb-safe">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 text-3xl">🎉</div>
              <h2 className="text-2xl font-black text-slate-900 mb-2 text-center">Your first digital bill!</h2>
              <p className="text-slate-500 font-medium text-center mb-6">Welcome to Ledgro. We're excited to help you grow your business.</p>
              <button
                onClick={() => setIsFirstBillDrawerOpen(false)}
                className="w-full bg-blue-600 text-white font-bold h-14 rounded-xl active:bg-blue-700 transition-colors"
              >
                Continue
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      <BottomNav />
    </div>
  );
}
