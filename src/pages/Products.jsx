import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Drawer } from 'vaul';
import { PackagePlus, ArrowRight, Search, Plus, Archive, ChevronDown, ChevronUp, AlertCircle, Edit2 } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { cn } from '../lib/utils';
import { useBodyLock } from '../hooks/useBodyLock';

export default function Products() {
  const billCount = parseInt(localStorage.getItem('ledgro-billCount') || '0');
  const { user, shopId } = useAuth();
  const catalogItems = useCatalogStore((state) => state.items);
  const addCatalogItem = useCatalogStore((state) => state.addItem);

  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [sortBy, setSortBy] = useState('recently_added');

  // Bottom Sheet State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // null means "Add New"

  useBodyLock(isDrawerOpen);

  // Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('piece');
  const [stockCount, setStockCount] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);


  const [submitting, setSubmitting] = useState(false);

  // Filter products
  const activeProducts = useMemo(() => {
    let filtered = catalogItems
      .filter(item => item.isActive !== false)
      .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));


    filtered = filtered.sort((a, b) => {
      // Always pull active low-stock items to the top regardless of standard sort
      const aIsLow = a.stockCount != null && a.lowStockAlert != null && a.stockCount <= a.lowStockAlert;
      const bIsLow = b.stockCount != null && b.lowStockAlert != null && b.stockCount <= b.lowStockAlert;
      if (aIsLow && !bIsLow) return -1;
      if (!aIsLow && bIsLow) return 1;


      // Standard sorting
      switch (sortBy) {
        case 'a_z':
          return a.name.localeCompare(b.name);
        case 'oldest':
          return (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
        case 'low_stock':
          return (a.stockCount || 0) - (b.stockCount || 0);
        case 'high_stock':
          return (b.stockCount || 0) - (a.stockCount || 0);
        case 'recently_added':
        default:
          return (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
      }
    });


    return filtered;
  }, [catalogItems, searchQuery, sortBy]);

  const inactiveProducts = useMemo(() => {
    return catalogItems
      .filter(item => item.isActive === false)
      .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [catalogItems, searchQuery]);

  const openDrawer = (item = null) => {
    setEditingItem(item);
    if (item) {
      setName(item.name);
      setPrice(item.lastUsedPrice?.toString() || '');
      setUnit(item.unit || 'piece');
      setStockCount(item.stockCount?.toString() || '');
      setLowStockAlert(item.lowStockAlert?.toString() || '');
      setCategory(item.category || '');
      setDescription(item.description || '');
      setIsActive(item.isActive !== false);
    } else {
      setName('');
      setPrice('');
      setUnit('piece');
      setStockCount('');
      setLowStockAlert('');
      setCategory('');
      setDescription('');
      setIsActive(true);
    }
    setIsDrawerOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!shopId || !name.trim() || !price) return;

    setSubmitting(true);

    try {
      const unitPrice = parseFloat(price);
      const stockNum = stockCount !== '' ? parseFloat(stockCount) : null;
      const alertNum = lowStockAlert !== '' ? parseFloat(lowStockAlert) : null;

      const payload = {
        name: sanitizeText(name.trim()),
        lastUsedPrice: unitPrice,
        unit: unit,
        stockCount: stockNum,
        lowStockAlert: alertNum,
        category: sanitizeText(category.trim()),
        description: description.trim(),
        isActive: isActive,
        updatedAt: serverTimestamp(),
      };

      if (editingItem && editingItem.id) {
        // Update existing
        const docRef = doc(db, `shops/${shopId}/catalog`, editingItem.id);
        await updateDoc(docRef, payload);

        addCatalogItem({
          ...editingItem,
          ...payload,
          updatedAt: new Date() // optimistic local time
        });
      } else {
        // Add new
        payload.addedBy = user.uid;
        payload.createdBy = user.uid;
        payload.createdAt = serverTimestamp();

        const docRef = await addDoc(collection(db, `shops/${shopId}/catalog`), payload);

        addCatalogItem({
          ...payload,
          id: docRef.id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      setIsDrawerOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save product");
    } finally {
      setSubmitting(false);
    }
  };

  const renderProductRow = (item) => {
    const isLowStock = item.lowStockAlert != null && item.stockCount != null && item.stockCount < item.lowStockAlert;

    return (
      <div
        key={item.id}
        onClick={() => openDrawer(item)}
        className="bg-white p-4 rounded-2xl shadow-subtle border border-slate-100 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform mb-3"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-slate-900 text-lg">{item.name}</h3>
            {item.category && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-semibold">
                {item.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="text-blue-600 font-bold">{formatCurrency(item.lastUsedPrice)}</span>
            <span>•</span>
            <span>{item.unit || 'piece'}</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          {item.stockCount != null && (
            <div className={cn(
              "px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1",
              isLowStock ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
            )}>
              {isLowStock && <AlertCircle size={14} />}
              {item.stockCount} {item.unit}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-4 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Products</h1>
          <button
            onClick={() => openDrawer()}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm"
          >
            <Plus size={18} /> Add Product
          </button>
        </div>


        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full h-11 pl-10 pr-3 border border-slate-200 rounded-xl shadow-subtle bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-all text-sm"
              placeholder="Search..."
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-11 px-3 border border-slate-200 rounded-xl shadow-subtle bg-white text-slate-700 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
          >
            <option value="recently_added">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="a_z">A-Z</option>
            <option value="low_stock">Lowest Stock</option>
            <option value="high_stock">Highest Stock</option>
          </select>
        </div>
      </header>

      <main className="p-4 flex-1">
        {activeProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500">
            <PackagePlus size={48} className="text-slate-300 mb-4" />
            <p className="font-semibold text-lg">No active products found.</p>
            <p className="text-sm">Click "Add Product" to get started.</p>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Active Catalog</h2>
            {activeProducts.map(renderProductRow)}
          </div>
        )}

        {/* Inactive Products Section */}
        {inactiveProducts.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="w-full flex items-center justify-between p-4 bg-slate-200/50 rounded-2xl text-slate-600 font-bold active:bg-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Archive size={18} />
                <span>Inactive Products ({inactiveProducts.length})</span>
              </div>
              {showInactive ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>


            {showInactive && (
              <div className="mt-4 opacity-75">
                {inactiveProducts.map(renderProductRow)}
              </div>
            )}
          </div>
        )}
      </main>

      <Drawer.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="bg-white flex flex-col rounded-t-[20px] mt-24 h-[85vh] fixed bottom-0 left-0 right-0 z-50 focus:outline-none">
            <div className="p-4 bg-white rounded-t-[20px] flex-shrink-0 border-b border-slate-100 flex items-center justify-between">
              <Drawer.Title className="font-bold text-slate-900 text-xl flex items-center gap-2">
                {editingItem ? <Edit2 size={20} className="text-blue-600" /> : <PackagePlus size={20} className="text-blue-600" />}
                {editingItem ? 'Edit Product' : 'New Product'}
              </Drawer.Title>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-32">
              <form id="product-form" onSubmit={handleSaveProduct} className="space-y-6">

                {/* Basic Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Product Info</h3>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Product Name *</label>
                    <input
                      type="text" required value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
                      placeholder="e.g. Aashirvaad Atta 5kg"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Selling Price *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                      <input
                        type="number" inputMode="decimal" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)}
                        className="w-full pl-8 pr-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-[10px] font-semibold text-slate-400 mt-1">Past bills will not be affected</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Unit</label>
                    <div className="flex overflow-x-auto no-scrollbar gap-2 bg-slate-100 p-1 rounded-xl">
                      {['piece', 'kg', 'litre', 'gram', 'ml'].map(u => (
                        <button
                          type="button"
                          key={u}
                          onClick={() => setUnit(u)}
                          className={`flex-1 min-w-[60px] py-1.5 text-xs font-bold capitalize rounded-lg transition-all ${unit === u ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* Inventory Management */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Inventory</h3>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Stock Count</label>
                    <div className="flex gap-2">
                       <input
                         type="number" inputMode="decimal" step="0.01" value={stockCount} onChange={(e) => setStockCount(e.target.value)}
                         className="flex-1 px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
                         placeholder="Current exact count"
                       />
                       <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                          <button type="button" onClick={() => setStockCount(prev => String(Math.max(0, (parseFloat(prev||0) - 1))))} className="w-10 h-10 flex items-center justify-center font-black text-slate-600 bg-white rounded-lg shadow-sm">-</button>
                          <button type="button" onClick={() => setStockCount(prev => String((parseFloat(prev||0) + 1)))} className="w-10 h-10 flex items-center justify-center font-black text-slate-600 bg-white rounded-lg shadow-sm">+</button>
                       </div>
                    </div>
                  </div>

{billCount >= 5 && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Low Stock Alert</label>
                      <div className="flex items-center gap-3">
                         <span className="text-sm text-slate-500 font-medium">Alert me when stock falls below</span>
                         <input
                           type="number" inputMode="decimal" step="1" value={lowStockAlert} onChange={(e) => setLowStockAlert(e.target.value)}
                           className="w-16 px-2 text-center h-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
                           placeholder="0"
                         />
                         <span className="text-sm text-slate-500 font-medium">items</span>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="border-slate-100" />

                {/* Category */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Category</h3>
                  <input
                    type="text" value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
                    placeholder="Enter or select a category"
                  />
                  <div className="flex flex-wrap gap-2">
                    {['Provisions', 'Snacks', 'Toiletries', 'Beverages', 'Stationery', 'Other'].map(cat => (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${category === cat ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* Status */}
                <div className="space-y-4">
                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Status</h3>
                   <label className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                     <div>
                       <span className="font-bold text-slate-900 block">Available for Sale</span>
                       <span className="text-xs text-slate-500">Uncheck to hide from POS</span>
                     </div>
                     <div className="relative inline-block w-12 h-6 rounded-full">
                       <input type="checkbox" className="peer sr-only" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                       <span className="absolute inset-0 bg-slate-300 rounded-full transition peer-checked:bg-green-500"></span>
                       <span className="absolute inset-y-1 left-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:left-7"></span>
                     </div>
                   </label>
                </div>

              </form>
            </div>


            <div className="p-4 bg-white border-t border-slate-100 pb-safe absolute bottom-0 left-0 right-0">
              <button
                type="submit"
                form="product-form"
                disabled={submitting || !name.trim() || !price}
                className="w-full bg-blue-600 text-white font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {submitting ? 'Saving...' : (editingItem ? 'Update Product' : 'Add to Catalog')} <ArrowRight size={20} />
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
