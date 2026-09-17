import { useReducer, useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { LogOut, Tag, ArrowRight, Share2, PlusCircle } from 'lucide-react';

import SearchInput from '../components/SearchInput';
import CartItem from '../components/CartItem';
import DiscountDrawer from '../components/DiscountDrawer';
import Receipt from '../components/Receipt';
import { billReducer, initialBillState, calculateBillTotals } from '../reducers/billReducer';
import BottomNav from '../components/BottomNav';
import html2canvas from 'html2canvas-pro';

import { useRef } from 'react';

export default function POS() {
  const { user, shopId, signOut } = useAuth();
  const hydrateCatalog = useCatalogStore((state) => state.hydrateCatalog);
  const addCatalogItem = useCatalogStore((state) => state.addItem);

  const [state, dispatch] = useReducer(billReducer, initialBillState);
  const receiptRef = useRef(null);

  // Drawer state
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [activeDiscountItem, setActiveDiscountItem] = useState(null); // null means global discount

  // Checkout state
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [lastBill, setLastBill] = useState(null);

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

  const handleAddItem = (item) => {
    dispatch({ type: 'ADD_ITEM', payload: item });

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

  const handleCheckout = async (paymentMethod) => {
    if (items.length === 0 || !shopId) return;
    setIsCheckingOut(true);

    try {
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
        paymentMethod,
        createdAt: serverTimestamp() // critical for offline ledger ordering
      };

      await addDoc(collection(db, `shops/${shopId}/bills`), payload);

      setLastBill(payload);
      setCheckoutSuccess(true);

    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Checkout failed. Check console.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleShareReceipt = async () => {
    if (!receiptRef.current) return;

    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 3, // High density for crisp text
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const file = new File([blob], `receipt-${Date.now()}.png`, { type: 'image/png' });

        // Try Web Share API first
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'Bill Receipt',
              text: 'Thank you for your purchase!'
            });
            return;
          } catch (shareErr) {
            console.log("Web share cancelled or failed", shareErr);
          }
        }

        // Fallback: URL encoded string for WhatsApp deep link
        const textFallback = `*Bill Receipt*\nTotal: ₹${lastBill.grandTotal}\nItems: ${lastBill.items.length}\nThank you!`;
        window.open(`https://wa.me/?text=${encodeURIComponent(textFallback)}`, '_blank');

      }, 'image/png');

    } catch (err) {
      console.error("Failed to generate receipt image", err);
      alert("Failed to share receipt");
    }
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
              onClick={handleShareReceipt}
              className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 active:bg-indigo-700 transition-colors"
            >
              <Share2 size={20} /> Share Receipt
            </button>
            <button
              onClick={handleNewBill}
              className="w-full bg-gray-100 text-gray-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 active:bg-gray-300 transition-colors"
            >
              <PlusCircle size={20} /> New Bill
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
        <h1 className="text-xl font-bold text-gray-900">New Bill</h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col pb-40"> {/* pb-40 ensures we don't hide behind sticky footer */}
        <div className="p-4 sticky top-[60px] z-20 bg-white/80 backdrop-blur-md">
          <SearchInput onAddItem={handleAddItem} />
        </div>

        <div className="px-4 flex-1">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 mt-20">
              <p>Search or add an item to begin</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {items.map(item => (
                <CartItem
                  key={item.id}
                  item={item}
                  dispatch={dispatch}
                  onOpenDiscount={openLineDiscount}
                />
              ))}
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
                  <span className="text-2xl font-bold text-gray-900 leading-none">
                    ₹{grandTotal}
                  </span>
                </div>
              </div>
            </div>

            {/* Checkout Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleCheckout('cash')}
                disabled={isCheckingOut}
                className="flex-1 bg-green-600 text-white font-bold py-3.5 px-4 rounded-xl active:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Cash
              </button>
              <button
                onClick={() => handleCheckout('upi')}
                disabled={isCheckingOut}
                className="flex-1 bg-indigo-600 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-1 active:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                UPI <ArrowRight size={18} />
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

      <BottomNav />
    </div>
  );
}
