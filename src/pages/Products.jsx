import { sheetStyle } from '../hooks/useKeyboardInset';
import { logActivity } from '../lib/audit';
import ImageCropSheet from '../components/ImageCropSheet';
import PhotoPreview from '../components/PhotoPreview';
import FieldError, { errRing } from '../components/FieldError';
import { toast } from 'sonner';
import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useInView } from 'react-intersection-observer';
import { useCatalogStore } from '../store/catalogStore';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Drawer } from 'vaul';
import { PackagePlus, Search, Plus, Archive, ChevronDown, ChevronUp, Edit2, Trash2, Camera, LayoutGrid, List, ArrowLeftRight, ArrowDownAZ, Check, X } from 'lucide-react';
import { formatCurrency, sanitizeText, cn } from '../lib/utils';
import { sessionGuard } from '../lib/SessionGuard';
import { useCatalogLoader } from '../hooks/useCatalogLoader';
import CategoryChips from '../components/CategoryChips';
import { useNameOf } from '../lib/memberNames';
import { VariantBuilder, VariantEditor } from '../components/VariantBuilder';
import { MAX_COMBOS, buildCombos, comboKey, isVariant, variantName, colourKey, colourCards, findGroupByName } from '../lib/variants';
import ProductColourCard from '../components/ProductColourCard';
import CostLoadStatus from '../components/CostLoadStatus';
import CatalogExportSheet from '../components/CatalogExportSheet';
import CatalogTransferSheet from '../components/CatalogTransferSheet';
import { confirm } from '../lib/confirm';
import ProductThumb from '../components/ProductThumb';
import ColourEditSheet from '../components/ColourEditSheet';
import { compressImage, loadItemImage, saveImage, removeImage, imageKey } from '../lib/productImage';
import { buildCatalogPdf } from '../lib/catalogPdf';
import { saveFile, shareFiles, canShareFilesHere } from '../lib/shareFile';
import { isNative } from '../lib/native';
import { putCost, costFields, withCosts } from '../lib/costs';
import { useCostStore } from '../store/costStore';
import { useCostsLoader } from '../hooks/useCostsLoader';
import { draftKey, saveDraft, loadDraft, clearDraft, sameDay } from '../lib/productDraft';
import { makeImages, zipFiles, chunk, MAX_SHARE_FILES } from '../lib/catalogImages';
import { planImages } from '../lib/catalogPng';
import { loadImagePrefs, saveImagePrefs, toRenderOptions, describePrefs } from '../lib/imagePrefs';
import { sendAction, skippedNote, toggleKey, selectAllKeys, pickedEntries } from '../lib/shareSelection';
import { useLongPress } from '../hooks/useLongPress';
import { useBackHandler } from '../hooks/useBackHandler';
import ImageOptionsSheet from '../components/ImageOptionsSheet';

const TIP_KEY = 'ledgro.selectTipSeen';
const tipSeen = () => { try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; } };

/** Wraps a card so press-and-hold starts select mode. */
function HoldToSelect({ onLong, children }) {
  const lp = useLongPress(onLong);
  return <div {...lp} style={{ WebkitTouchCallout: 'none' }}>{children}</div>;
}

const ProductRow = memo(function ProductRow({ item, onOpen }) {
  const tracked = item.stockCount != null;
  const out = tracked && item.stockCount <= 0;
  const low = tracked && item.lowStockAlert != null && item.stockCount <= item.lowStockAlert;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="press glass-card mb-3 flex w-full items-center justify-between rounded-2xl p-3 text-left"
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
});

const ProductCard = memo(function ProductCard({ item, onOpen }) {
  const tracked = item.stockCount != null;
  const out = tracked && item.stockCount <= 0;
  return (
    <button type="button" onClick={() => onOpen(item)} className="press glass-card overflow-hidden rounded-2xl text-left transition-transform">
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
});

export default function Products() {
  const billCount = parseInt(localStorage.getItem('ledgro-billCount') || '0');
  const { user, shopId, shopAdminId, shopName } = useAuth();
  const nameOf = useNameOf(shopId, user?.uid);
  const catalogItems = useCatalogStore((state) => state.items);
  const addCatalogItem = useCatalogStore((state) => state.addItem);
  const removeCatalogItem = useCatalogStore((state) => state.removeItem);

  useCatalogLoader(shopId);

  const isAdmin = user?.uid === shopAdminId;
  useCostsLoader(shopId, isAdmin);
  const costMap = useCostStore((st) => st.costs);
  const setCostLocal = useCostStore((st) => st.setOne);
  // Until the owner-only costs have loaded, the form may show old values: don't write that copy then (the product copy still gets it, and Move costs picks it up).
  const costsLoaded = useCostStore((st) => st.loaded);
  const writeCosts = isAdmin && costsLoaded;
  // Cost and supplier come from the owner-only collection, falling back to the old product fields until moved.

  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('q') || '');
  const [showInactive, setShowInactive] = useState(false);
  const [sortBy, setSortBy] = useState('recently_added');
  const [filter, setFilter] = useState('__all__');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [fe, setFe] = useState({}); // inline field errors: { name, price, cost, stock }
  const clearFe = (k) => setFe((p) => (p[k] ? { ...p, [k]: '' } : p));
  const [unit, setUnit] = useState('piece');
  const [stockCount, setStockCount] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [hasVariants, setHasVariants] = useState(false);
  const [axes, setAxes] = useState([{ name: 'Size', values: '' }, { name: 'Colour', values: '' }]);
  const [comboStock, setComboStock] = useState({});
  const [optionEdits, setOptionEdits] = useState({});
  const [joinGroup, setJoinGroup] = useState(null);
  const [convert, setConvert] = useState(false);
  const [photo, setPhoto] = useState(null); // data URL shown in the form
  const [photoDirty, setPhotoDirty] = useState(false);
  const [draftNote, setDraftNote] = useState(false); // 'Draft restored' banner
  const [cropFile, setCropFile] = useState(null); // picked photo waiting to be cropped
  const [viewPhoto, setViewPhoto] = useState(false);
  const [view, setView] = useState('list');
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [imgProgress, setImgProgress] = useState(null);
  const cancelRef = useRef(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [optsOpen, setOptsOpen] = useState(false);
  const [imgPrefs, setImgPrefs] = useState(loadImagePrefs);
  const [tipOpen, setTipOpen] = useState(() => !tipSeen());
  const changePrefs = (p) => { setImgPrefs(p); saveImagePrefs(p); };
  const dismissTip = () => { setTipOpen(false); try { localStorage.setItem(TIP_KEY, '1'); } catch { /* ignore */ } };

  const [submitting, setSubmitting] = useState(false);
  const [colourEditKey, setColourEditKey] = useState(null);
  const savingRef = useRef(false);
  useEffect(() => { if (!submitting) savingRef.current = false; }, [submitting]);

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
      if (sortBy !== 'a_z') {
        if (aIsLow && !bIsLow) return -1;
        if (!aIsLow && bIsLow) return 1;
      }

      switch (sortBy) {
        case 'a_z':
          return (a.baseName || a.name || '').localeCompare(b.baseName || b.name || '', undefined, { sensitivity: 'base', numeric: true });
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

  // A New Product form is kept on this phone while you type, so closing it or reloading the app does not lose it.
  const isNewForm = !editingItem && !joinGroup;
  const dKey = draftKey(shopId, user?.uid);
  const holdDraft = useRef(false); // true while the 'old draft' question is open, so an empty form never overwrites it
  const collectDraft = () => ({ name, price, unit, stockCount, lowStockAlert, category, description, source, costPrice, isActive, hasVariants, axes, comboStock, photo });
  useEffect(() => {
    if (!isDrawerOpen || !isNewForm || !dKey) return undefined;
    const t = setTimeout(() => { if (!holdDraft.current) saveDraft(dKey, collectDraft()); }, 500);
    return () => clearTimeout(t);
    // collectDraft reads exactly the fields listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawerOpen, isNewForm, dKey, name, price, unit, stockCount, lowStockAlert, category, description, source, costPrice, isActive, hasVariants, axes, comboStock, photo]);

  const applyDraft = (d) => {
    setName(d.name || ''); setPrice(d.price || ''); setUnit(d.unit || 'piece'); setStockCount(d.stockCount || '');
    setLowStockAlert(d.lowStockAlert || ''); setCategory(d.category || ''); setDescription(d.description || ''); setSource(d.source || '');
    setCostPrice(d.costPrice || ''); setIsActive(d.isActive !== false); setHasVariants(!!d.hasVariants);
    if (Array.isArray(d.axes) && d.axes.length) setAxes(d.axes.map((a) => ({ name: String(a.name ?? ''), values: String(a.values ?? '') })));
    setComboStock(d.comboStock && typeof d.comboStock === 'object' ? d.comboStock : {});
    if (d.photo) { setPhoto(d.photo); setPhotoDirty(true); }
    setDirty(true);
    setDraftNote(true);
  };
  const offerDraft = async () => {
    const d = loadDraft(dKey);
    if (!d) return;
    try {
      if (!sameDay(d.savedAt)) {
        holdDraft.current = true;
        const when = new Date(d.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const keep = await confirm({ title: 'Continue your old draft?', message: `You started "${d.name || 'a product'}" on ${when}.`, confirmText: 'Continue', cancelText: 'Start fresh' });
        if (!keep) { clearDraft(dKey); return; }
      }
      applyDraft(d);
    } finally { holdDraft.current = false; }
  };
  const discardDraft = async () => {
    if (submitting) return;
    if (!(await confirm({ title: 'Discard this draft?', message: 'What you entered will be lost.', confirmText: 'Discard', cancelText: 'Keep editing', danger: true }))) return;
    clearDraft(dKey);
    setDraftNote(false);
    setDirty(false);
    setIsDrawerOpen(false);
    toast('Draft discarded');
  };

  /** Close the sheet; if anything was typed, ask before throwing it away. */
  const requestClose = async () => {
    if (submitting) return;
    if (isNewForm && dKey) { saveDraft(dKey, collectDraft()); if (dirty) toast('Draft saved'); setIsDrawerOpen(false); return; }
    if (dirty && !(await confirm({ title: 'Discard changes?', message: 'What you entered will be lost.', confirmText: 'Discard', cancelText: 'Keep editing', danger: true }))) return;
    if (dirty) toast('Discarded');
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
    setDraftNote(false);
    setOptionEdits(item?.options ? { ...item.options } : {});
    // Adding to an existing product: keep its colour (and any other axis) filled in, only the size is typed fresh.
    setAxes(group ? Object.keys(group.options || {}).map((k) => ({ name: k, values: /^sizes?$/i.test(k.trim()) ? '' : String(group.options[k] ?? '') })) : [{ name: 'Size', values: '' }, { name: 'Colour', values: '' }]);
    const src = group ? group.from : item;
    if (src) {
      setName(group ? group.baseName : (src.baseName || src.name));
      setPrice(src.lastUsedPrice ? (src.lastUsedPrice / 100).toString() : '');
      setUnit(src.unit || 'piece');
      setStockCount(group ? '' : (src.stockCount?.toString() || ''));
      setLowStockAlert(src.lowStockAlert?.toString() || '');
      setCategory(src.category || '');
      setDescription(src.description || '');
      const cf = costFields(src, isAdmin ? costMap : null);
      setSource(cf.source || '');
      setCostPrice(cf.costPrice != null ? (cf.costPrice / 100).toString() : '');
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
    if (pic?.hasImage) loadItemImage(shopId, pic).then((d) => setPhoto((cur) => cur ?? d));
    setIsDrawerOpen(true);
    if (!src && !item && !group) offerDraft();
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (!shopId) return;
    const errs = {};
    if (!name.trim()) errs.name = 'Enter the product name.';
    const unitPrice = parseFloat(price);
    if (price === '' ) errs.price = 'Enter the selling price in rupees.';
    else if (isNaN(unitPrice) || unitPrice < 0) errs.price = 'Selling price must be a number, 0 or more.';
    const stockNum = stockCount !== '' ? parseFloat(stockCount) : null;
    const costNum = costPrice !== '' ? parseFloat(costPrice) : null;
    if (costNum !== null && (isNaN(costNum) || costNum < 0)) errs.cost = 'Cost price must be a number, 0 or more. Leave it empty if you do not know it.';
    if (stockNum !== null && (isNaN(stockNum) || stockNum < 0)) errs.stock = 'Stock must be a number, 0 or more.';
    if (Object.keys(errs).length) { setFe(errs); toast.error(Object.values(errs)[0]); return; }
    setFe({});

    sessionGuard.assertValidSession(user.uid);

    const alertNum = lowStockAlert !== '' ? parseFloat(lowStockAlert) : null;

    if (stockNum !== null && (isNaN(stockNum) || stockNum < 0)) {
      toast.error("Please enter a valid stock count");
      return;
    }

    if (savingRef.current) return; // a double tap must not save twice
    savingRef.current = true;
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
      const persistPhoto = async (keys) => {
        if (!photoDirty) return;
        try {
          for (const key of [...new Set([].concat(keys))]) {
            if (photo) await saveImage(shopId, key, photo, user.uid);
            else await removeImage(shopId, key);
          }
        } catch (err) {
          console.error(err);
          toast.error(`Saved, but the picture failed (${err?.code || err?.message || 'unknown'}). Try again.`);
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
        // Staff never see or send cost and supplier; the owner's copy lives in the owner-only collection (and, until step 2, here too).
        ...(isAdmin ? { source: sanitizeText(source.trim()).slice(0, 60), costPrice: costNum !== null ? Math.round(costNum * 100) : null } : {}),
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

        // Price and stock changes are written to the activity log together with the edit itself.
        const wb = writeBatch(db);
        wb.update(docRef, payload);
        if (writeCosts) putCost(wb, shopId, editingItem.id, { costPrice: basePayload.costPrice, source: basePayload.source });
        const oldPrice = Number(editingItem.lastUsedPrice) || 0;
        const newPrice = Number(basePayload.lastUsedPrice) || 0;
        if (oldPrice !== newPrice) logActivity(wb, shopId, user.uid, { action: 'price_change', amount: newPrice, note: `${editingItem.name}: ${formatCurrency(oldPrice)} to ${formatCurrency(newPrice)}` });
        if (stockNum !== null && editingItem.stockCount != null && stockNum !== editingItem.stockCount) logActivity(wb, shopId, user.uid, { action: 'stock_change', amount: 0, note: `${editingItem.name}: ${editingItem.stockCount} to ${stockNum} pairs` });
        await wb.commit();
        if (writeCosts) setCostLocal(editingItem.id, { costPrice: basePayload.costPrice, source: basePayload.source });

        addCatalogItem({
          ...editingItem,
          ...basePayload,
          updatedBy: user.uid,
          stockCount: updatedStockForState,
          updatedAt: new Date()
        });
        await persistPhoto(imageKey(editingItem));
        if (editingVariant && photoDirty) {
          const sibs = catalogItems.filter((i) => i.groupId === editingItem.groupId && i.id !== editingItem.id && colourKey(i) === colourKey(editingItem));
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
        // Same product name (any capitalisation) joins the existing product instead of making a second one.
        const existing = joinGroup?.groupId || editingItem?.groupId ? null : findGroupByName(catalogItems, baseName);
        const groupId = joinGroup?.groupId || existing?.groupId || doc(collection(db, `shops/${shopId}/catalog`)).id;
        // A product that already has Size and Colour must get both on every new variant,
        // otherwise the new ones land as a separate, colour-less product.
        const sibling = catalogItems.find((i) => i.groupId === groupId && i.options);
        const needed = Object.keys(sibling?.options || {});
        const lacking = needed.find((k) => !fresh.every((o) => Object.keys(o).some((x) => x.toLowerCase() === k.toLowerCase())));
        if (lacking) { toast.error(`This product already has ${lacking}. Fill ${lacking} too.`); setSubmitting(false); return; }
        const batch = writeBatch(db);
        const created = [];
        // Turning a plain product into variants keeps the SAME product (its bills and photo stay linked) as the first variant, instead of hiding it and making copies.
        const reuse = convert && editingItem?.id ? editingItem : null;
        let first = true;
        for (const opts of fresh) {
          const raw = comboStock[comboKey(opts)];
          const stockN = raw === undefined || raw === '' ? null : parseFloat(raw);
          if (stockN !== null && (isNaN(stockN) || stockN < 0)) { toast.error('Enter a valid stock count'); setSubmitting(false); return; }
          if (reuse && first) {
            first = false;
            // A blank stock box must never wipe the stock this product already had.
            const upd = { ...basePayload, name: variantName(baseName, opts), baseName, groupId, options: opts, stockCount: stockN ?? reuse.stockCount ?? null, updatedBy: user.uid };
            batch.update(doc(db, `shops/${shopId}/catalog`, reuse.id), upd);
            created.push({ ...reuse, ...upd, id: reuse.id, updatedAt: new Date() });
            continue;
          }
          const ref = doc(collection(db, `shops/${shopId}/catalog`));
          const payload = {
            ...basePayload, name: variantName(baseName, opts), baseName, groupId, options: opts, stockCount: stockN,
            createdBy: user.uid, createdAt: serverTimestamp(), frequency: 0,
          };
          batch.set(ref, payload);
          created.push({ ...payload, id: ref.id, createdAt: new Date(), updatedAt: new Date() });
        }
        if (writeCosts) created.forEach((c) => putCost(batch, shopId, c.id, { costPrice: basePayload.costPrice, source: basePayload.source }));
        await batch.commit();
        if (writeCosts) created.forEach((c) => setCostLocal(c.id, { costPrice: basePayload.costPrice, source: basePayload.source }));
        created.forEach((c) => addCatalogItem(c));
        await persistPhoto(created.map((c) => imageKey(c)));
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
        if (writeCosts) {
          try {
            const cb = writeBatch(db);
            putCost(cb, shopId, newId, { costPrice: basePayload.costPrice, source: basePayload.source });
            await cb.commit();
            setCostLocal(newId, { costPrice: basePayload.costPrice, source: basePayload.source });
          } catch (e) { console.warn('Cost not saved to the owner-only place; the product copy still has it', e); }
        }

        addCatalogItem({
          ...payload,
          id: newId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await persistPhoto(newId);
        toast.success('Product added');
      }

      if (isNewForm) { clearDraft(dKey); setDraftNote(false); }
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

      await deleteDoc(docRef);
      // The picture goes too, unless another size of the same colour still uses it.
      const key = imageKey(editingItem);
      const shared = catalogItems.some((i) => i.id !== editingItem.id && !i.deleted && imageKey(i) === key);
      let photoLeft = false;
      if (editingItem.hasImage && !shared) { try { await removeImage(shopId, key); } catch (e) { console.warn('Picture not removed', e); photoLeft = true; } }
      // Older photos were saved under the bare group id: remove that one too when nothing else in the group is left.
      if (editingItem.groupId && !catalogItems.some((i) => i.id !== editingItem.id && !i.deleted && i.groupId === editingItem.groupId)) {
        try { await removeImage(shopId, editingItem.groupId); } catch (e) { console.warn('Old picture not removed', e); }
      }
      if (photoLeft) toast.warning('Product deleted, but its photo could not be removed. It will be cleaned up later.');

      removeCatalogItem(editingItem.id);
      toast.success('Product deleted');
      setIsDrawerOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete product');
    } finally {
      setSubmitting(false);
    }
  };

  // Rows are memoised components, so typing in the form does not redraw the whole list.
  const openRef = useRef(null);
  useEffect(() => { openRef.current = openDrawer; });
  const onOpen = useCallback((item) => openRef.current?.(item), []);
  const renderProductRow = (item) => <ProductRow key={item.id} item={item} onOpen={onOpen} />;
  const entries = useMemo(() => colourCards(activeProducts), [activeProducts]);
  const setColourEdit = useCallback((e) => setColourEditKey(e.key), []);
  const colourEdit = colourEditKey ? entries.find((e) => e.key === colourEditKey) : null;
  // Show 40 at a time and add more while scrolling, so a big catalog never draws everything at once.
  const resetKey = `${filter}|${searchQuery}|${view}|${entries.length}`;
  const [lim, setLim] = useState({ key: resetKey, n: 40 });
  const limit = lim.key === resetKey ? lim.n : 40;
  const { ref: moreRef, inView: moreInView } = useInView({ rootMargin: '400px' });
  useEffect(() => { if (moreInView) setLim((l) => ({ key: resetKey, n: (l.key === resetKey ? l.n : 40) + 40 })); }, [moreInView, resetKey]);
  const visible = entries.slice(0, limit);
  const withSelect = (e, node) => (selectMode ? (
    <div key={keyOf(e)} className="relative">
      {node}
      <button type="button" aria-pressed={selected.has(keyOf(e))} aria-label={`Select ${e.name || e.item?.name}`} onClick={() => toggleSel(keyOf(e))}
        className="absolute inset-0 z-10 rounded-2xl bg-transparent">
        <span className={cn('absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border-2', selected.has(keyOf(e)) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white/90 text-transparent')}>
          <Check size={22} aria-hidden="true" />
        </span>
      </button>
    </div>
  ) : <HoldToSelect key={keyOf(e)} onLong={() => startSelect(keyOf(e))}>{node}</HoldToSelect>);
  const renderEntry = (e) => withSelect(e, e.type === 'colour'
    ? <ProductColourCard key={e.key} entry={e} onEdit={setColourEdit} onShare={shareOne} />
    : renderProductRow(e.item));
  const renderProductCard = (item) => <ProductCard key={item.id} item={item} onOpen={onOpen} />;

  const keyOf = (e) => e.key || e.item.id;
  const toggleSel = (k) => setSelected((cur) => toggleKey(cur, k));
  const startSelect = (k) => { setSelectMode(true); setSelected(new Set([k])); dismissTip(); };
  // Only cards in the current list count: if the search or category changed, hidden picks are ignored.
  const selectedEntries = useMemo(() => pickedEntries(entries, selected, keyOf), [entries, selected]);
  const selectedItems = useMemo(() => selectedEntries.flatMap((e) => e.items || [e.item]), [selectedEntries]);
  const endSelect = useCallback(() => { setSelectMode(false); setSelected(new Set()); }, []);
  useBackHandler(selectMode, endSelect);
  const renderOpts = useMemo(() => toRenderOptions(imgPrefs), [imgPrefs]);
  const plan = useMemo(() => planImages(selectedItems, renderOpts), [selectedItems, renderOpts]);
  const send = sendAction(plan.cards.length);

  // Pictures are drawn one by one; on iOS the share sheet needs a fresh tap, so a toast button offers it after drawing.
  const exportImages = async ({ items, options, mode }) => {
    if (imgProgress) return;
    cancelRef.current = false;
    setImgProgress({ done: 0, total: 1 });
    try {
      const { files, failed, cancelled } = await makeImages({
        items, options, shopName,
        getImage: (it) => loadItemImage(shopId, it),
        onProgress: (done, total) => setImgProgress({ done, total }),
        isCancelled: () => cancelRef.current,
      });
      if (cancelled) { toast('Cancelled.'); return; }
      if (failed.length) toast.error(`Could not make ${failed.length}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '...' : ''}. The rest are ready.`, { duration: 8000 });
      if (!files.length) return;
      const day = new Date().toISOString().slice(0, 10);
      // One picture is saved as a plain PNG. Several go in a ZIP, in parts of 100 so the phone is not overloaded.
      const saveAll = async () => {
        if (files.length === 1) { await saveFile(files[0].blob, files[0].name, 'Product picture'); return; }
        const parts = chunk(files);
        for (let k = 0; k < parts.length; k++) {
          await saveFile(await zipFiles(parts[k]), `Product-Images-${day}${parts.length > 1 ? `-part-${k + 1}-of-${parts.length}` : ''}.zip`, 'Product pictures');
        }
      };
      if (mode === 'zip' || files.length > MAX_SHARE_FILES) { await saveAll(); endSelect(); return; }
      const r = await shareFiles(files, 'Product pictures');
      if (r === 'shared' || r === 'cancelled') { if (r === 'shared') endSelect(); return; }
      // Drawing took seconds, so the browser no longer accepts a share. Offer a fresh tap where sharing exists, else save.
      if (!isNative && canShareFilesHere(files)) {
        toast.success(`${files.length} picture${files.length === 1 ? '' : 's'} ready`, {
          duration: 30000,
          action: { label: 'Share', onClick: async () => { if ((await shareFiles(files, 'Product pictures')) === 'unsupported') await saveAll(); } },
        });
      } else await saveAll();
      endSelect();
    } catch (err) {
      console.error(err);
      toast.error('Could not make the pictures.');
    } finally { setImgProgress(null); }
  };

  const shareOne = (entry) => exportImages({ items: entry.items || [entry.item], options: renderOpts, mode: 'share' });
  const sendSelected = () => exportImages({ items: selectedItems, options: renderOpts, mode: send.mode });

  const exportCatalog = async ({ items, options, stock, cats }) => {
    if (!items.length || exporting) return;
    setExporting(true);
    try {
      const bits = [filter === '__all__' ? '' : filterOptions.find((o) => o.value === filter)?.label, stock === 'in' ? 'In stock' : stock === 'out' ? 'Out of stock' : '', cats ? `${cats.length} categories` : ''].filter(Boolean);
      const blob = await buildCatalogPdf({
        shopName,
        items,
        getImage: (it) => loadItemImage(shopId, it),
        subtitle: bits.join(', '),
        options,
      });
      await saveFile(blob, `Product-Catalog-${new Date().toISOString().slice(0, 10)}.pdf`, 'Product Catalog');
      setExportOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Could not create the PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      {selectMode && (
        <div className="sticky top-0 z-30 flex items-center gap-2 bg-blue-600 px-2 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
          <button type="button" onClick={endSelect} aria-label="Exit select mode" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/20"><X size={22} aria-hidden="true" /></button>
          <span className="min-w-0 flex-1 truncate text-lg font-black" role="status">{selectedEntries.length} selected</span>
          <button type="button" onClick={() => setSelected(selectedEntries.length === entries.length ? new Set() : selectAllKeys(entries, keyOf))} className="h-11 rounded-full px-4 text-sm font-bold active:bg-white/20">
            {selectedEntries.length === entries.length ? 'Clear' : `Select all ${entries.length}`}
          </button>
        </div>
      )}
      <header className={cn('glass-header sticky top-0 z-30 px-4 pb-3 pt-4', selectMode && 'hidden')}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-900">Products</h1>
            <p className="text-xs font-medium text-slate-500">{activeProducts.length} {activeProducts.length === 1 ? 'item' : 'items'}</p>
          </div>
          <button type="button" onClick={() => openDrawer()} className="press flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-5 text-sm font-bold text-white shadow-md">
            <Plus size={16} aria-hidden="true" /> New
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input maxLength={60}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input block h-12 w-full rounded-full pl-11 pr-4 text-sm font-semibold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search products..."
          />
        </div>
        <div className="no-scrollbar -mx-4 mb-1 flex gap-2 overflow-x-auto px-4">
          <button type="button" aria-pressed={sortBy === 'a_z'} onClick={() => setSortBy((v) => (v === 'a_z' ? 'recently_added' : 'a_z'))}
            className={cn('press flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold', sortBy === 'a_z' ? 'bg-blue-600 text-white shadow-md' : 'glass-btn-flat')}>
            <ArrowDownAZ size={15} aria-hidden="true" /> A to Z
          </button>
          <button type="button" onClick={() => setView(view === 'list' ? 'grid' : 'list')} className="press glass-btn-flat flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold">
            {view === 'list' ? <LayoutGrid size={15} aria-hidden="true" /> : <List size={15} aria-hidden="true" />}{view === 'list' ? 'Grid' : 'List'}
          </button>
          <a href="#/transfers" className="press glass-btn-flat flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold">
            <PackagePlus size={15} aria-hidden="true" /> Stock in/out
          </a>
          {isAdmin && (
            <button type="button" onClick={() => setTransferOpen(true)} className="press glass-btn-flat flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold">
              <ArrowLeftRight size={15} aria-hidden="true" /> Import / export
            </button>
          )}
        </div>
        {filterOptions.length > 2 && <div className="mt-2"><CategoryChips options={filterOptions} value={filter} onChange={setFilter} /></div>}
      </header>

      <main className={cn('p-4 flex-1', selectMode && 'pb-44')}>
        {tipOpen && !selectMode && entries.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
            <span className="min-w-0 flex-1">Tip: press and hold a product to send pictures.</span>
            <button type="button" onClick={dismissTip} aria-label="Dismiss tip" className="flex h-11 w-11 items-center justify-center"><X size={16} aria-hidden="true" /></button>
          </div>
        )}
        {activeProducts.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-16 text-center">
            <span className="glass-card mb-5 flex h-20 w-20 items-center justify-center rounded-full text-slate-400"><PackagePlus size={34} aria-hidden="true" /></span>
            <p className="text-lg font-black text-slate-900">{searchQuery.trim() ? 'No products match' : 'No products yet'}</p>
            <p className="mt-1 max-w-xs text-sm font-medium text-slate-500">{searchQuery.trim() ? 'Try a different name, or clear the search.' : 'Add your first product to start billing, or import a list.'}</p>
            {searchQuery.trim()
              ? <button type="button" onClick={() => setSearchQuery('')} className="press glass-btn-flat mt-5 h-11 rounded-full px-6 text-sm font-bold">Clear search</button>
              : <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => openDrawer()} className="press flex h-11 items-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-bold text-white shadow-md"><Plus size={16} aria-hidden="true" />Add product</button>
                  {isAdmin && <button type="button" onClick={() => setTransferOpen(true)} className="press glass-btn-flat flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold"><ArrowLeftRight size={16} aria-hidden="true" />Import</button>}
                </div>}
          </div>
        ) : (
          view === 'grid'
            ? <div className="rise-list grid grid-cols-2 gap-4">{visible.map((e) => (e.type === 'colour' ? <div key={e.key} className="col-span-2">{renderEntry(e)}</div> : withSelect(e, renderProductCard(e.item))))}</div>
            : <div className="rise-list">{visible.map(renderEntry)}</div>
        )}
        {entries.length > limit && <div ref={moreRef} className="py-6 text-center text-sm font-semibold text-slate-400">Loading more...</div>}

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

      {colourEdit && (
        <ColourEditSheet
          key={colourEdit.key}
          entry={colourEdit}
          groupItems={catalogItems.filter((i) => i.groupId === colourEdit.groupId && !i.deleted)}
          isAdmin={isAdmin}
          onClose={() => setColourEditKey(null)}
          onAddColour={(options) => {
            const e = colourEdit;
            setColourEditKey(null);
            // Photos belong to one colour: the new colour starts with none, never the old colour's.
            openDrawer(null, { groupId: e.groupId, baseName: e.name, options, from: { ...e.rep, hasImage: false } });
          }}
        />
      )}

      <Drawer.Root handleOnly repositionInputs={false} open={isDrawerOpen} onOpenChange={(o) => (o ? setIsDrawerOpen(true) : requestClose())}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} className="bg-white flex flex-col rounded-t-[20px] mt-24 max-h-[85dvh] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none overflow-hidden">
            <div className="p-4 bg-white rounded-t-[20px] flex-shrink-0 border-b border-slate-100 flex items-center justify-between">
              <Drawer.Title className="font-bold text-slate-900 text-xl flex items-center gap-2">
                {editingItem ? <Edit2 size={20} className="text-blue-600" /> : <PackagePlus size={20} className="text-blue-600" />}
                {editingItem ? 'Edit Product' : 'New Product'}
              </Drawer.Title>
              <div className="flex items-center gap-2">
              <button
                aria-label="Close"
                onClick={requestClose}
                className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-6 relative">
              {draftNote && <p className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700" role="status">Draft restored. Tap Discard at the bottom to start fresh.</p>}
              <form id="product-form" noValidate onSubmit={handleSaveProduct} onChange={() => setDirty(true)} className="space-y-6">

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Product Info</h3>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Product Name *</label>
                    <input
                      type="text" value={name} onChange={(e) => { setName(e.target.value); clearFe('name'); }} maxLength={99} aria-invalid={!!fe.name}
                      className={'w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900' + errRing(fe.name)}
                      autoFocus
                    />
                    <FieldError>{fe.name}</FieldError>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Photo (catalog only, not shown on bills)</label>
                    {(() => {
                      const pick = async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        setCropFile(f);
                      };
                      const btn = 'flex-1 cursor-pointer rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-bold text-slate-700 active:scale-95 transition-transform';
                      return (
                        <div className="flex items-center gap-3">
                          <button type="button" disabled={!photo} onClick={() => setViewPhoto(true)} aria-label={photo ? 'View photo' : 'No photo yet'} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center">
                            {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Camera size={28} className="text-slate-400" />}
                          </button>
                          {cropFile && <ImageCropSheet file={cropFile} onCancel={() => setCropFile(null)} onDone={async (f) => { setCropFile(null); try { setPhoto(await compressImage(f)); setPhotoDirty(true); setDirty(true); } catch (err) { toast.error(err.message || 'Could not use that photo.'); } }} />}
                          {viewPhoto && photo && <PhotoPreview src={photo} onClose={() => setViewPhoto(false)} />}
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex gap-2">
                              <label className={btn}>Take photo<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} /></label>
                              <label className={btn}>{photo ? 'Replace' : 'Gallery'}<input type="file" accept="image/*" className="sr-only" onChange={pick} /></label>
                            </div>
                            {photo
                              ? <button type="button" onClick={() => { setPhoto(null); setPhotoDirty(true); setDirty(true); }} className="text-left text-sm font-bold text-red-600">Remove photo</button>
                              : <p className="text-xs text-slate-500">You can move, zoom and rotate it after picking. Saved as a square.</p>}
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
                    <p className="text-xs text-slate-500">The first variant below is this same product and keeps its stock if you leave that box empty. Other variants are new: set their stock.</p>
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
                        type="number" inputMode="decimal" step="0.01" value={price} onChange={(e) => { setPrice(e.target.value.slice(0, 10)); clearFe('price'); }} maxLength={99} aria-invalid={!!fe.price}
                        className={'w-full pl-8 pr-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900' + errRing(fe.price)}
                      />
                    </div>
                    <FieldError>{fe.price}</FieldError>
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

                  {isAdmin && (<>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Bought from (optional)</label>
                    <input
                      type="text" value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} disabled={!costsLoaded}
                      className="w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Cost price (optional)</label>
                    <input
                      type="number" inputMode="decimal" step="0.01" min="0" disabled={!costsLoaded} value={costPrice} onChange={(e) => { setCostPrice(e.target.value.slice(0, 10)); clearFe('cost'); }} aria-invalid={!!fe.cost}
                      className={'w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900' + errRing(fe.cost)}
                      placeholder="What you paid per piece"
                    />
                    <FieldError>{fe.cost}</FieldError>
                    <CostLoadStatus />
                  </div>
                  </>)}

                  {!hasVariants && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Stock Count</label>
                    <div className="flex gap-2">
                       <input
                         type="number" inputMode="decimal" step="0.01" value={stockCount} onChange={(e) => { setStockCount(e.target.value.slice(0, 10)); clearFe('stock'); }} maxLength={10} aria-invalid={!!fe.stock}
                         className={'flex-1 px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900' + errRing(fe.stock)}
                         placeholder="Current exact count"
                       />
                       <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                          <button type="button" onClick={() => setStockCount(prev => String(Math.max(0, (parseFloat(prev||0) - 1))))} className="w-10 h-10 flex items-center justify-center font-black text-slate-600 bg-white rounded-lg shadow-sm">-</button>
                          <button type="button" onClick={() => setStockCount(prev => String((parseFloat(prev||0) + 1)))} className="w-10 h-10 flex items-center justify-center font-black text-slate-600 bg-white rounded-lg shadow-sm">+</button>
                       </div>
                    <FieldError>{fe.stock}</FieldError>
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
                    placeholder="Optional, e.g. Men, Ladies, Kids"
                  />
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
                       <span className="text-xs text-slate-500">Uncheck to hide from Sell</span>
                     </div>
                     <div className="relative inline-block w-12 h-6 rounded-full">
                       <input type="checkbox" className="peer sr-only" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                       <span className="absolute inset-0 bg-slate-300 rounded-full transition peer-checked:bg-green-500"></span>
                       <span className="absolute inset-y-1 left-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:left-7"></span>
                     </div>
                   </label>
                </div>

              </form>

              <div className="sheet-foot mt-8 flex gap-2 pb-safe">
                {editingItem && <button type="button" aria-label="Delete product" onClick={handleDeleteProduct} disabled={submitting} className="press flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 disabled:opacity-50"><Trash2 size={20} /></button>}
                {(dirty || draftNote) && <button type="button" onClick={isNewForm ? discardDraft : requestClose} disabled={submitting} className="press h-12 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 disabled:opacity-50">Discard</button>}
                <button type="submit" form="product-form" disabled={submitting || !name.trim() || !price} className="press flex h-12 flex-1 items-center justify-center rounded-xl bg-blue-600 font-bold text-white shadow-sm disabled:opacity-50">
                  {submitting ? 'Saving...' : (editingItem ? 'Update' : 'Save product')}
                </button>
              </div>
            </div>

          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <CatalogExportSheet open={exportOpen} onClose={() => setExportOpen(false)} items={activeProducts} busy={exporting} onExport={exportCatalog} />
      <ImageOptionsSheet open={optsOpen} onClose={() => setOptsOpen(false)} prefs={imgPrefs} onChange={changePrefs} sample={selectedEntries[0]?.items || (selectedEntries[0]?.item ? [selectedEntries[0].item] : null)} />

      {isAdmin && <CatalogTransferSheet open={transferOpen} onClose={() => setTransferOpen(false)} onPdf={() => { setTransferOpen(false); setExportOpen(true); }} items={withCosts(catalogItems, costMap)} shopId={shopId} shopName={shopName} uid={user?.uid} onAdded={(list) => list.forEach(addCatalogItem)} />}

      {selectMode && (
        <div className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[44rem] space-y-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          {imgProgress && (
            <div role="status" className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round((Math.min(imgProgress.done, imgProgress.total) / Math.max(1, imgProgress.total)) * 100)}%` }} /></div>
              <span className="text-xs font-bold text-slate-700">Making {Math.min(imgProgress.done + 1, imgProgress.total)} of {imgProgress.total}</span>
              <button type="button" onClick={() => { cancelRef.current = true; }} className="h-11 rounded-lg px-3 text-sm font-bold text-slate-700">Cancel</button>
            </div>
          )}
          <button type="button" disabled={send.disabled || !!imgProgress} onClick={sendSelected} className="h-14 w-full rounded-xl bg-blue-600 text-base font-bold text-white active:scale-95 transition-transform disabled:opacity-40">{send.label}</button>
          <p className="text-center text-xs text-slate-600">{describePrefs(imgPrefs)} · <button type="button" onClick={() => setOptsOpen(true)} className="inline-flex h-11 items-center px-1 font-bold text-blue-600">Change</button></p>
          {skippedNote(plan.skipped) && <p className="text-center text-xs font-semibold text-amber-700">{skippedNote(plan.skipped)}</p>}
        </div>
      )}
      <BottomNav />
    </div>
  );
}
