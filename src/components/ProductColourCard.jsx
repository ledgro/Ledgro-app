import { memo, useEffect, useRef, useState } from 'react';
import { Camera, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import ProductThumb from './ProductThumb';
import ImageCropSheet from './ImageCropSheet';
import PhotoPreview from './PhotoPreview';
import { compressImage, saveImage, removeImage, imageKey, loadItemImage } from '../lib/productImage';
import { sizeLabelOf } from '../lib/variants';
import { confirm } from '../lib/confirm';
import { formatCurrency, cn } from '../lib/utils';

const tone = (it) => {
  if (it.stockCount == null) return 'text-slate-400';
  if (it.stockCount <= 0) return 'text-red-600';
  if (it.lowStockAlert != null && it.stockCount <= it.lowStockAlert) return 'text-amber-600';
  return 'text-green-700';
};

/** One product in one colour: its own photo (change it here, other colours are untouched) and its sizes. */
function ProductColourCard({ entry, onEdit, onShare }) {
  const { shopId, user } = useAuth();
  const addItem = useCatalogStore((s) => s.addItem);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const photoBox = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (!photoBox.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const input = useRef(null);
  const [cropFile, setCropFile] = useState(null);
  const [viewSrc, setViewSrc] = useState(null);
  const openPreview = async () => {
    if (!hasPhoto) return;
    try { const d = await loadItemImage(shopId, rep); if (d) setViewSrc(d); } catch { toast.error('Could not open the photo.'); }
  };
  const { name, colour, items, rep } = entry;
  const hasPhoto = items.some((i) => i.hasImage);
  const prices = items.map((i) => Number(i.lastUsedPrice) || 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const tracked = items.filter((i) => i.stockCount != null);
  const total = tracked.reduce((a, i) => a + Math.max(0, i.stockCount), 0);

  // Photo and flag go to every size of this colour only.
  const setFlag = async (has) => {
    for (let i = 0; i < items.length; i += 15) {
      const batch = writeBatch(db);
      const part = items.slice(i, i + 15);
      part.forEach((it) => batch.update(doc(db, `shops/${shopId}/catalog`, it.id), { hasImage: has, updatedBy: user.uid, updatedAt: serverTimestamp() }));
      await batch.commit();
      part.forEach((it) => addItem({ ...it, hasImage: has }));
    }
  };

  const onPick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || busy) return;
    setCropFile(f); // crop first, then save
  };

  const saveCropped = async (f) => {
    setCropFile(null);
    if (busy) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again.'); return; }
    setBusy(true);
    try {
      const img = await compressImage(f);
      await saveImage(shopId, imageKey(rep), img, user.uid);
      try { await setFlag(true); } catch (flagErr) {
        // Photo saved but the products were not marked: undo the photo so nothing is half-done.
        try { await removeImage(shopId, imageKey(rep)); } catch { /* ignore */ }
        throw flagErr;
      }
    } catch (err) {
      console.error(err);
      toast.error(`Could not save the photo (${err?.code || err?.message || 'unknown'}).`);
    } finally { setBusy(false); }
  };

  const onRemove = async () => {
    if (busy || !(await confirm({ title: `Remove ${colour || 'this'} photo?`, message: 'Other colours keep their photos.', confirmText: 'Remove', danger: true }))) return;
    setBusy(true);
    try {
      await removeImage(shopId, imageKey(rep));
      await setFlag(false);
    } catch (err) {
      console.error(err);
      toast.error(`Could not remove the photo (${err?.code || 'unknown'}).`);
    } finally { setBusy(false); }
  };

  return (
    <div className="glass-card mb-4 rounded-2xl p-4">
      <div className="flex items-start gap-4">
        <div ref={photoBox} className="relative shrink-0">
          <button type="button" onClick={openPreview} disabled={!hasPhoto} aria-label={hasPhoto ? 'View photo' : 'No photo yet'} className="block rounded-xl"><ProductThumb item={rep} className="h-20 w-20" /></button>
          {cropFile && <ImageCropSheet file={cropFile} onCancel={() => setCropFile(null)} onDone={saveCropped} />}
          {viewSrc && <PhotoPreview src={viewSrc} onClose={() => setViewSrc(null)} />}
          <button type="button" aria-label={`${hasPhoto ? 'Change' : 'Add'} photo for ${colour || name}`} disabled={busy} aria-haspopup={hasPhoto ? 'menu' : undefined} aria-expanded={hasPhoto ? menu : undefined}
            onClick={() => (hasPhoto ? setMenu((m) => !m) : input.current?.click())}
            className="absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center active:scale-95 disabled:opacity-50">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white shadow"><Camera size={16} /></span>
          </button>
          {onShare && hasPhoto && (
            <button type="button" onClick={() => onShare(entry)} aria-label={`Share picture of ${name} ${colour}`} className="absolute -left-3 -top-3 flex h-11 w-11 items-center justify-center active:scale-95">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-blue-600 shadow"><Share2 size={16} aria-hidden="true" /></span>
            </button>
          )}
          {menu && (
            <div role="menu" className="absolute left-0 top-full z-20 mt-3 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); input.current?.click(); }} className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm font-bold text-slate-800">Choose new photo</button>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onRemove(); }} className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm font-bold text-red-600">Remove photo</button>
            </div>
          )}
          <input ref={input} type="file" accept="image/*" className="sr-only" onChange={onPick} />
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onEdit(entry)} className="block w-full text-left">
          <h3 className="truncate text-base font-bold text-slate-900">{name}</h3>
          {colour && (
            <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
              {colour}
            </p>
          )}
          <p className="mt-1 text-sm font-extrabold text-blue-600">{min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`}</p>
          <p className="text-xs text-slate-500">{items.length} size{items.length === 1 ? '' : 's'}{tracked.length ? ` · ${total} in stock` : ''}</p>
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {items.map((it) => (
          <button key={it.id} type="button" onClick={() => onEdit(entry)}
            className={cn('min-w-[3.5rem] rounded-xl border border-slate-200 px-3 py-2 text-center active:scale-95 transition-transform', it.stockCount != null && it.stockCount <= 0 && 'opacity-50')}>
            <span className={cn('block text-sm font-bold text-slate-900', it.stockCount != null && it.stockCount <= 0 && 'line-through')}>{sizeLabelOf(it)}</span>
            <span className={cn('mt-0.5 block text-xs font-semibold', tone(it))}>{it.stockCount == null ? '-' : it.stockCount <= 0 ? 'Out' : it.stockCount}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(ProductColourCard);
