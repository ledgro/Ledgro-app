import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { PackagePlus, ArrowRight } from 'lucide-react';

export default function Products() {
  const { user, shopId } = useAuth();
  const addCatalogItem = useCatalogStore((state) => state.addItem);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!shopId || !name.trim() || !price) return;

    setSubmitting(true);

    try {
      const unitPrice = parseFloat(price);

      const payload = {
        name: name.trim(),
        lastUsedPrice: unitPrice,
        addedBy: user.uid,
        createdAt: serverTimestamp()
      };

      // 1. Asynchronous write to Firestore
      await addDoc(collection(db, `shops/${shopId}/catalog`), payload);

      // 2. Optimistic update to Zustand store
      addCatalogItem({ name: payload.name, lastUsedPrice: unitPrice });

      // Reset form
      setName('');
      setPrice('');
      alert("Product added successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to add product");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Add Product</h1>
      </header>

      <main className="p-4 flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-subtle border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-50 text-blue-600 p-4 rounded-full">
              <PackagePlus size={32} />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">New Catalog Item</h2>

          <form onSubmit={handleAddProduct} className="space-y-6">
            <div>
              <label htmlFor="productName" className="block text-sm font-semibold text-slate-700">
                Product Name
              </label>
              <div className="mt-2">
                <input
                  id="productName"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="appearance-none block w-full px-4 h-14 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium transition-all"
                  placeholder="e.g. Sugar 1kg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="productPrice" className="block text-sm font-semibold text-slate-700">
                Default Price
              </label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-slate-400 font-bold text-lg">₹</span>
                </div>
                <input
                  id="productPrice"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="appearance-none block w-full pl-8 pr-4 h-14 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !name.trim() || !price}
              className="w-full bg-blue-600 text-white font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {submitting ? 'Saving...' : 'Add to Catalog'} <ArrowRight size={20} />
            </button>
          </form>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
