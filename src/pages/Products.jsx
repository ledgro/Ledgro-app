import { sheetStyle } from '../hooks/useKeyboardInset';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { collection, addDoc, doc, updateDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Drawer } from 'vaul';
import { PackagePlus, Search, Plus, Archive, ChevronDown, ChevronUp, Edit2, Trash2, Camera, FileDown, LayoutGrid, List } from 'lucide-react';
import { formatCurrency, sanitizeText, cn } from '../lib/utils';
import { sessionGuard } from '../lib/SessionGuard';
import { useCatalogLoader } from '../hooks/useCatalogLoader';
import CategoryChips from '../components/CategoryChips';
import { useNameOf } from '../lib/memberNames';
import { VariantBuilder, VariantEditor } from '../components/VariantBuilder';
import { MAX_COMBOS, buildCombos, comboKey, isVariant, variantName } from '../lib/variants';
import { confirm } from '../lib/confirm';
import ProductThumb from '../components/ProductThumb';
import { compressImage, loadImage, saveImage, removeImage, imageKey } from '../lib/productImage';
import { buildCatalogPdf } from '../lib/catalogPdf';
import { saveFile } from '../lib/shareFile';

export default function Products() {
  const billCount = parseInt(localStorage.getItem('ledgro-billCount') || '0');
  const { user, shopId, shopAdminId, shopName } = useAuth();
  const nameOf = useNameOf(shopId, user?.uid);
  const catalogItems = useCatalogStore((state) => state.items);
  const addCatalogItem = useCatalogStore((state) => state.addItem);
  const removeCatalogItem = useCatalogStore((state) => state.removeItem);

  useCatalogLoader(shopId);

  const isAdmin = user?.uid === shopAdminId;

  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [sortBy] = useState('recently_added');
  const [filter, setFilter] = useState('__all__');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('piece');
  const [stockCount, setStockCount] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [hasVariants, setHasVariants] = useState(false);
  const [axes, setAxes] = useState([{ name: 'Size', values: '' }]);
  const [comboStock, setComboStock] = useState({});
  const [optionEdits, setOptionEdits] = useState({});
  const [joinGroup, setJoinGroup] = useState(null);
  const [convert, setConvert] = useState(false);
  const [photo, setPhoto] = useState(null); // data URL shown in the form
  const [photoDirty, setPhotoDirty] = useState(false);
  const [view, setView] = useState('list');
  const [exporting, setExporting] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const activeProducts = useMemo(() => {
    let filtered = catalogItems
      .filter(item => item.isActive !== false)
      .filter(item => item.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(item => {
        if (filter === '__all__') return true;
        if (filter === '__photo__') return !!item.hasImage;
        if (filter === '__nophoto__') return !item.hasImage;
        if (filter === '__low__') return item.stockCount != null && item.lowStockAlert != null && item.stockCount <= item.lowStockAlert;
        return (item.category || '').trim() === filter;
      });

    filtered = filtered.sort((a, b) => {
      const aIsLow = a.stockCount != null && a.lowStockAlert != null && a.stockCount <= a.lowStockAlert;
      const bIsLow = b.stockCount != null && b.lowStockAlert != null && b.stockCount <= b.lowStockAlert;
      if (aIsLow && !bIsLow) return -1;
      if (!aIsLow && bIsLow) return 1;

      switch (sortBy) {
        case 'a_z':
          return (a.name || '').localeCompare(b.name || '');
        case 'oldest':
          return (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
        case 'low_stock':
          if (a.stockCount == null && b.stockCount != null) return 1;
          if (a.stockCount != null && b.stockCount == null) return -1;
          return (a.stockCount || 0) - (b.stockCount || 0);
        case 'high_stock':
          if (a.stockCount == null && b.stockCount != null) return 1;
          if (a.stockCount != null && b.stockCount == null) return -1;
          return (b.stockCount || 0) - (a.stockCount || 0);
        case 'recently_added':
        default:
          return (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
      }
    });

    return filtered;
  }, [catalogItems, searchQuery, sortBy, filter]);

  const filterOptions = useMemo(() => {
    const cats = [...new Set(catalogItems.filter((i) => i.isActive !== false).map((i) => (i.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const hasLow = catalogItems.some((i) => i.isActive !== false && i.stockCount != null && i.lowStockAlert != null && i.stockCount <= i.lowStockAlert);
    const hasPhotos = catalogItems.some((i) => i.isActive !== false && i.hasImage);
    return [{ value: '__all__', label: 'All' }, ...(hasLow ? [{ value: '__low__', label: 'Low stock' }] : []), ...(hasPhotos ? [{ value: '__photo__', label: 'With photo' }, { value: '__nophoto__', label: 'No photo' }] : []), ...cats.map((c) => ({ value: c, label: c }))];
  }, [catalogItems]);

  const inactiveProducts = useMemo(() => {
    return catalogItems
      .filter(item => item.isActive === false)
      .filter(item => item.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [catalogItems, searchQuery]);

  /** Close the sheet; if anything was typed, ask before throwing it away. */
  const requestClose = async () => {
    if (submitting) return;
    if (dirty && !(await confirm({ title: 'Discard changes?', message: 'What you entered will be lost.', confirmText: 'Discard', cancelText: 'Keep editing', danger: true }))) return;
    setIsDrawerOpen(false);
  };

  const openDrawer = (item = null, group = null) => {
    setDirty(false);
    setEditingItem(group ? null : item);
    setHasVariants(!!group);
    setJoinGroup(group);
    setConvert(false);
    setPhoto(null);
    setPhotoDirty(false);
    setComboStock({});
    setOptionEdits(item?.options ? { ...item.options } : {});
    setAxes(group ? Object.keys(group.options).map((k) => ({ name: k, values: '' })) : [{ name: 'Size', values: '' }]);
    const src = group ? group.from : item;
    if (src) {
      setName(group ? group.baseName : (src.baseName || src.name));
      setPrice(src.lastUsedPrice ? (src.lastUsedPrice / 100).toString() : '');
      setUnit(src.unit || 'piece');
      setStockCount(group ? '' : (src.stockCount?.toString() || ''));
      setLowStockAlert(src.lowStockAlert?.toString() || '');
      setCategory(src.category || '');
      setDescription(src.description || '');
      setSource(src.source || '');
      setCostPrice(src.costPrice != null ? (src.costPrice / 100).toString() : '');
      setIsActive(src.isActive !== false);
    } else {
      setName('');
      setPrice('');
      setUnit('piece');
      setStockCount('');
      setLowStockAlert('');
      setCategory('');
      setDescription('');
      setSource('');
      setCostPrice('');
      setIsActive(true);
    }
    const pic = group ? group.from : item;
    if (pic?.hasImage) loadImage(shopId, imageKey(pic)).then((d) => setPhoto((cur) => cur ?? d));
    setIsDrawerOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!shopId || !name.trim() || !price) return;

    sessionGuard.assertValidSession(user.uid);

    const unitPrice = parseFloat(price);
    if (isNaN(unitPrice) || unitPrice < 0) {
      toast.error("Please enter a valid price");
      return;
    }

    const stockNum = stockCount !== '' ? parseFloat(stockCount) : null;
    const costNum = costPrice !== '' ? parseFloat(costPrice) : null;
    if (costNum !== null && (isNaN(costNum) || costNum < 0)) {
      toast.error('Please enter a valid cost price');
      return;
    }
    const alertNum = lowStockAlert !== '' ? parseFloat(lowStockAlert) : null;

    if (stockNum !== null && (isNaN(stockNum) || stockNum < 0)) {
      toast.error("Please enter a valid stock count");
      return;
    }

    setSubmitting(true);

    try {
      const cleanCategory = sanitizeText(category.trim());
      const normalizedCategory = cleanCategory ? cleanCategory.charAt(0).toUpperCase() + cleanCategory.slice(1).toLowerCase() : '';

      const editingVariant = !!(editingItem && isVariant(editingItem));
      const cleanOptions = {};
      if (editingVariant) {
        for (const [axis, value] of Object.entries(optionEdits)) {
          const v = sanitizeText(String(value).trim()).slice(0, 30);
          if (!v) { toast.error(`Enter a value for ${axis}`); setSubmitting(false); return; }
          cleanOptions[axis] = v;
        }
      }
      const baseName = sanitizeText(name.trim());
      const variantFields = editingVariant ? { name: variantName(baseName, cleanOptions), baseName, options: cleanOptions } : {};

      const hasImageNext = photoDirty ? !!photo : !!(editingItem ? editingItem.hasImage : joinGroup?.from?.hasImage);
      const persistPhoto = async (key) => {
        if (!photoDirty) return;
        try {
          if (photo) await saveImage(shopId, key, photo, user.uid);
          else await removeImage(shopId, key);
        } catch (err) {
          console.error(err);
          toast.error('Saved, but the picture could not be saved. Try adding it again.');
        }
      };

      const basePayload = {
        hasImage: hasImageNext,
        name: baseName,
        lastUsedPrice: Math.round(unitPrice * 100),
        unit: unit,
        lowStockAlert: alertNum,
        category: normalizedCategory,
        description: sanitizeText(description.trim()),
        source: sanitizeText(source.trim()).slice(0, 60),
        costPrice: costNum !== null ? Math.round(costNum * 100) : null,
        isActive: isActive,
        updatedAt: serverTimestamp(),
        ...variantFields,
      };

      if (editingItem && editingItem.id && !convert) {
        // Update existing (Admin stock check done in rules, but UI respects it)
        if (editingVariant && catalogItems.some((i) => i.id !== editingItem.id && i.name?.toLowerCase() === basePayload.name.toLowerCase())) {
          toast.error('That variant already exists.');
          setSubmitting(false);
          return;
        }
        const docRef = doc(db, `shops/${shopId}/catalog`, editingItem.id);
        const payload = { ...basePayload, updatedBy: user.uid };

        let updatedStockForState = editingItem.stockCount;
        if (stockNum !== null) {
           if (editingItem.stockCount == null) {
             payload.stockCount = stockNum;
             updatedStockForState = stockNum;
           } else {
             // Increment based on the difference to prevent overwriting intermediate sales
             const diff = stockNum - editingItem.stockCount;
             if (diff !== 0) {
               payload.stockCount = increment(diff);
               updatedStockForState = stockNum;
             }
           }
        } else {
           payload.stockCount = null;
           updatedStockForState = null;
        }

        await updateDoc(docRef, payload);

        addCatalogItem({
          ...editingItem,
          ...basePayload,
          updatedBy: user.uid,
          stockCount: updatedStockForState,
          updatedAt: new Date()
        });
        await persistPhoto(imageKey(editingItem));
        if (editingVariant && photoDirty) {
          const sibs = catalogItems.filter((i) => i.groupId === editingItem.groupId && i.id !== editingItem.id);
          for (let i = 0; i < sibs.length; i += 15) {
            const batch = writeBatch(db);
            const part = sibs.slice(i, i + 15);
            part.forEach((sib) => batch.update(doc(db, `shops/${shopId}/catalog`, sib.id), { hasImage: hasImageNext, updatedBy: user.uid, updatedAt: serverTimestamp() }));
            await batch.commit();
            part.forEach((sib) => addCatalogItem({ ...sib, hasImage: hasImageNext }));
          }
        }
        if (editingVariant && baseName !== editingItem.baseName) {
          const siblings = catalogItems.filter((i) => i.groupId === editingItem.groupId && i.id !== editingItem.id);
          for (let i = 0; i < siblings.length; i += 15) {
            const batch = writeBatch(db);
            const renamed = siblings.slice(i, i + 15).map((sib) => ({ ...sib, baseName, name: variantName(baseName, sib.options) }));
            renamed.forEach((sib) => batch.update(doc(db, `shops/${shopId}/catalog`, sib.id), { baseName, name: sib.name, updatedBy: user.uid, updatedAt: serverTimestamp() }));
            await batch.commit();
            renamed.forEach((sib) => addCatalogItem(sib));
          }
        }
        toast.success('Product updated');
      } else if (hasVariants) {
        const combos = buildCombos(axes);
        if (!combos.length) { toast.error('Add an option with at least one value.'); setSubmitting(false); return; }
        if (combos.length > MAX_COMBOS) { toast.error(`Up to ${MAX_COMBOS} variants at a time.`); setSubmitting(false); return; }
        const taken = new Set(catalogItems.map((i) => i.name?.toLowerCase()));
        const fresh = combos.filter((opts) => !taken.has(variantName(baseName, opts).toLowerCase()));
        if (!fresh.length) { toast.error('Those variants already exist.'); setSubmitting(false); return; }
        const groupId = joinGroup?.groupId || doc(collection(db, `shops/${shopId}/catalog`)).id;
        const batch = writeBatch(db);
        const created = [];
        for (const opts of fresh) {
          const raw = comboStock[comboKey(opts)];
          const stockN = raw === undefined || raw === '' ? null : parseFloat(raw);
          if (stockN !== null && (isNaN(stockN) || stockN < 0)) { toast.error('Enter a valid stock count'); setSubmitting(false); return; }
          const ref = doc(collection(db, `shops/${shopId}/catalog`));
          const payload = {
            ...basePayload, name: variantName(baseName, opts), baseName, groupId, options: opts, stockCount: stockN,
            createdBy: user.uid, createdAt: serverTimestamp(), frequency: 0,
          };
          batch.set(ref, payload);
          created.push({ ...payload, id: ref.id, createdAt: new Date(), updatedAt: new Date() });
        }
        await batch.commit();
        created.forEach((c) => addCatalogItem(c));
        await persistPhoto(groupId);
        if (convert && editingItem?.id) {
          // The plain product is replaced by its variants: hide it from billing and lists.
          await updateDoc(doc(db, `shops/${shopId}/catalog`, editingItem.id), { isActive: false, updatedBy: user.uid, updatedAt: serverTimestamp() });
          addCatalogItem({ ...editingItem, isActive: false });
        }
        toast.success(fresh.length === 1 ? 'Variant added' : `${fresh.length} variants added`);
      } else {
        // Check for duplicates before adding
        const isDuplicate = catalogItems.some(item => item.name?.toLowerCase() === name.trim().toLowerCase());
        if (isDuplicate) {
           toast.error("A product with this exact name already exists.");
           setSubmitting(false);
           return;
        }

        const payload = { ...basePayload, stockCount: stockNum };
        payload.createdBy = user.uid;
        payload.createdAt = serverTimestamp();
        payload.frequency = 0;

        const collectionRef = collection(db, `shops/${shopId}/catalog`);
        const newDocRef = await addDoc(collectionRef, payload);
        const newId = newDocRef.id;

        addCatalogItem({
          ...payload,
          id: newId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await persistPhoto(newId);
        toast.success('Product added');
      }

      setIsDrawerOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save product");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again.'); return; }
    if (!editingItem || !editingItem.id || !shopId) return;

    if (!isAdmin) {
       toast.error("Only Admins can permanently delete products. You can mark it 'Inactive' instead.");
       return;
    }

    if (!(await confirm({ title: 'Delete product?', message: `"${editingItem.name}" will be removed from the catalog for good. Old bills keep it.`, confirmText: 'Delete', danger: true }))) return;

    setSubmitting(true);
    try {
      const docRef = doc(db, `shops/${shopId}/catalog`, editingItem.id);

      await updateDoc(docRef, { deleted: true, isActive: false, updatedBy: user.uid, updatedAt: serverTimestamp() });

      removeCatalogItem(editingItem.id);
      toast.success('Product permanently deleted');
      setIsDrawerOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete product');
    } finally {
      setSubmitting(false);
    }
  };

  const renderProductRow = (item) => {
    const tracked = item.stockCount != null;
    const out = tracked && item.stockCount <= 0;
    const low = tracked && item.lowStockAlert != null && item.stockCount <= item.lowStockAlert;

    return (
      <button
        type="button"
        key={item.id}
        onClick={() => openDrawer(item)}
        className="flex w-full items-center justify-between border-b border-slate-100 py-3 text-left active:bg-slate-50"
      >
        <ProductThumb item={item} className="mr-3 h-12 w-12" />
        <div className="min-w-0 flex-1 pr-3">
          <h3 className="truncate text-base font-semibold text-slate-900">{item.name}</h3>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            <span className="font-bold text-blue-600">{formatCurrency(item.lastUsedPrice)}</span>
            {' · '}{item.unit || 'piece'}
            {item.source ? ` · from ${item.source}` : ''}
          </p>
        </div>
        {tracked && (
          <span className={cn('shrink-0 text-sm font-bold', out ? 'text-red-600' : low ? 'text-amber-600' : 'text-green-700')}>
            {out ? 'Out' : `${item.stockCount} ${item.unit || 'unit'}`}
          </span>
        )}
      </button>
    );
  };

  const renderProductCard = (item) => {
    const tracked = item.stockCount != null;
    const out = tracked && item.stockCount <= 0;
    return (
      <button type="button" key={item.id} onClick={() => openDrawer(item)} className="overflow-hidden rounded-2xl border border-slate-100 bg-white text-left shadow-sm active:scale-[0.98] transition-transform">
        <ProductThumb item={item} className="aspect-square w-full !rounded-none" />
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.name}</h3>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-blue-600">{formatCurrency(item.lastUsedPrice)}</span>
            {tracked && <span className={cn('text-xs font-bold', out ? 'text-red-600' : 'text-slate-500')}>{out ? 'Out' : item.stockCount}</span>}
          </div>
        </div>
      </button>
    );
  };

  const exportCatalog = async () => {
    if (!activeProducts.length || exporting) return;
    const hasOut = activeProducts.some((i) => i.stockCount != null && i.stockCount <= 0);
    let list = activeProducts;
    if (hasOut) {
      const withOut = await confirm({ title: 'Include out-of-stock items?', message: 'The catalog follows your current search and filter.', confirmText: 'Include all', cancelText: 'In stock only' });
      if (!withOut) list = activeProducts.filter((i) => i.stockCount == null || i.stockCount > 0);
      if (!list.length) { toast.error('Nothing in stock to export.'); return; }
    }
    setExporting(true);
    try {
      const label = filterOptions.find((o) => o.value === filter)?.label;
      const blob = await buildCatalogPdf({
        shopName,
        items: list,
        getImage: (it) => loadImage(shopId, imageKey(it)),
        subtitle: filter === '__all__' ? '' : label,
      });
      await saveFile(blob, `Product-Catalog-${new Date().toISOString().slice(0, 10)}.pdf`, 'Product Catalog');
    } catch (err) {
      console.error(err);
      toast.error('Could not create the PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 pt-4 pb-1">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Products</h1>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={view === 'list' ? 'Grid view' : 'List view'} onClick={() => setView(view === 'list' ? 'grid' : 'list')} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              {view === 'list' ? <LayoutGrid size={18} /> : <List size={18} />}
            </button>
            <button type="button" aria-label="Export catalog PDF" onClick={exportCatalog} disabled={exporting || !activeProducts.length} className="flex h-9 items-center gap-1 rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-700 disabled:opacity-50">
              <FileDown size={16} /> PDF
            </button>
          <button
            type="button"
            onClick={() => openDrawer()}
            className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white active:scale-95 transition-transform"
          >
            <Plus size={16} /> New
          </button>
          </div>
        </div>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search products..."
          />
        </div>
        {filterOptions.length > 2 && <CategoryChips options={filterOptions} value={filter} onChange={setFilter} />}
      </header>

      <main className="p-4 flex-1">
        {activeProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500">
            <PackagePlus size={48} className="text-slate-300 mb-4" />
            <p className="font-semibold text-lg">No active products found.</p>
            <p className="text-sm">Tap "New" to add your first product.</p>
          </div>
        ) : (
          view === 'grid'
            ? <div className="grid grid-cols-2 gap-3">{activeProducts.map(renderProductCard)}</div>
            : <div>{activeProducts.map(renderProductRow)}</div>
        )}

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

      <Drawer.Root handleOnly repositionInputs={false} open={isDrawerOpen} onOpenChange={(o) => (o ? setIsDrawerOpen(true) : requestClose())}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content style={sheetStyle} className="bg-white flex flex-col rounded-t-[20px] mt-24 max-h-[85vh] fixed bottom-0 left-0 right-0 z-50 focus:outline-none overflow-hidden">
            <div className="p-4 bg-white rounded-t-[20px] flex-shrink-0 border-b border-slate-100 flex items-center justify-between">
              <Drawer.Title className="font-bold text-slate-900 text-xl flex items-center gap-2">
                {editingItem ? <Edit2 size={20} className="text-blue-600" /> : <PackagePlus size={20} className="text-blue-600" />}
                {editingItem ? 'Edit Product' : 'New Product'}
              </Drawer.Title>
              <button
                aria-label="Close"
                onClick={requestClose}
                className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-[200px] relative">
              <form id="product-form" onSubmit={handleSaveProduct} onChange={() => setDirty(true)} className="space-y-6">

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Product Info</h3>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Product Name *</label>
                    <input
                      type="text" required value={name} onChange={(e) => setName(e.target.value)} maxLength={99}
                      className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Photo (catalog only, not shown on bills)</label>
                    {(() => {
                      const pick = async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        try { setPhoto(await compressImage(f)); setPhotoDirty(true); setDirty(true); } catch (err) { toast.error(err.message || 'Could not use that photo.'); }
                      };
                      const btn = 'flex-1 cursor-pointer rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-bold text-slate-700 active:scale-95 transition-transform';
                      return (
                        <div className="flex items-center gap-3">
                          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center">
                            {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Camera size={28} className="text-slate-400" />}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex gap-2">
                              <label className={btn}>Take photo<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} /></label>
                              <label className={btn}>{photo ? 'Replace' : 'Gallery'}<input type="file" accept="image/*" className="sr-only" onChange={pick} /></label>
                            </div>
                            {photo
                              ? <button type="button" onClick={() => { setPhoto(null); setPhotoDirty(true); setDirty(true); }} className="text-left text-sm font-bold text-red-600">Remove photo</button>
                              : <p className="text-xs text-slate-500">Cropped to a square and shrunk automatically.</p>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {!editingItem && !joinGroup && (
                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} className="w-5 h-5 rounded border-slate-300" />
                      This product has variants (size, colour, anything)
                    </label>
                  )}
                  {editingItem && !isVariant(editingItem) && !convert && (
                    <button type="button" onClick={() => { setConvert(true); setHasVariants(true); setDirty(true); if (photo) setPhotoDirty(true); }} className="text-sm font-bold text-blue-600">
                      Split into variants (size, colour)
                    </button>
                  )}
                  {convert && (
                    <p className="text-xs text-slate-500">Saving creates the variants below and hides this product. Set stock for each variant.</p>
                  )}
                  {hasVariants && (!editingItem || convert) && (
                    <VariantBuilder axes={axes} setAxes={setAxes} comboStock={comboStock} setComboStock={setComboStock} />
                  )}
                  {editingItem && isVariant(editingItem) && (
                    <div className="space-y-2">
                      <VariantEditor options={optionEdits} setOptions={setOptionEdits} />
                      <button
                        type="button"
                        onClick={() => openDrawer(null, { groupId: editingItem.groupId, baseName: editingItem.baseName || editingItem.name, options: editingItem.options, from: editingItem })}
                        className="text-sm font-bold text-blue-600"
                      >
                        Add another variant
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Selling Price *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                      <input
                        type="number" inputMode="decimal" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value.slice(0, 10))} maxLength={99}
                        className="w-full pl-8 pr-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                      />
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Past bills will not be affected</p>
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

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Inventory</h3>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Bought from (optional)</label>
                    <input
                      type="text" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60}
                      className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Cost price (optional)</label>
                    <input
                      type="number" inputMode="decimal" step="0.01" min="0" value={costPrice} onChange={(e) => setCostPrice(e.target.value.slice(0, 10))}
                      className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                      placeholder="What you paid per piece"
                    />
                  </div>

                  {!hasVariants && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Stock Count</label>
                    <div className="flex gap-2">
                       <input
                         type="number" inputMode="decimal" step="0.01" value={stockCount} onChange={(e) => setStockCount(e.target.value.slice(0, 10))} maxLength={10}
                         className="flex-1 px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                         placeholder="Current exact count"
                       />
                       <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                          <button type="button" onClick={() => setStockCount(prev => String(Math.max(0, (parseFloat(prev||0) - 1))))} className="w-10 h-10 flex items-center justify-center font-black text-slate-600 bg-white rounded-lg shadow-sm">-</button>
                          <button type="button" onClick={() => setStockCount(prev => String((parseFloat(prev||0) + 1)))} className="w-10 h-10 flex items-center justify-center font-black text-slate-600 bg-white rounded-lg shadow-sm">+</button>
                       </div>
                    </div>
                  </div>
                  )}

{billCount >= 5 && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Low Stock Alert</label>
                      <div className="flex items-center gap-3">
                         <span className="text-sm text-slate-500 font-medium">Alert me when stock falls below</span>
                         <input
                           type="number" inputMode="decimal" step="1" value={lowStockAlert} onChange={(e) => setLowStockAlert(e.target.value.slice(0, 10))} maxLength={10}
                           className="w-16 px-2 text-center h-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                         />
                         <span className="text-sm text-slate-500 font-medium">items</span>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="border-slate-100" />

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Category</h3>
                  <input
                    type="text" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={99}
                    className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
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

                {editingItem && (editingItem.createdBy || editingItem.updatedBy) && (
                  <p className="text-xs text-slate-500">
                    {editingItem.createdBy ? `Added by ${nameOf(editingItem.createdBy)}` : ''}
                    {editingItem.createdBy && editingItem.updatedBy ? ' · ' : ''}
                    {editingItem.updatedBy ? `Edited by ${nameOf(editingItem.updatedBy)}` : ''}
                  </p>
                )}
                <div className="space-y-4">
                   <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Status</h3>
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

            <div className="p-4 bg-white border-t border-slate-100 pb-safe absolute bottom-0 left-0 right-0 flex gap-2">
              {editingItem && (
                <button
                  type="button"
                  onClick={handleDeleteProduct}
                  disabled={submitting}
                  className="w-14 h-14 shrink-0 bg-red-50 text-red-600 rounded-xl flex items-center justify-center active:bg-red-100 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Trash2 size={20} />
                </button>
              )}
              <button
                type="button"
                onClick={requestClose}
                disabled={submitting}
                className="h-14 shrink-0 rounded-xl bg-slate-100 px-5 font-bold text-slate-700 active:bg-slate-200 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={submitting || !name.trim() || !price}
                className="flex-1 bg-blue-600 text-white font-bold h-14 rounded-xl flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {submitting ? 'Saving...' : (editingItem ? 'Update Product' : 'Save product')}
              </button>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <BottomNav />
    </div>
  );
}
