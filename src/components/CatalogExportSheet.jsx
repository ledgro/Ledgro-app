import { useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { groupCatalog } from '../lib/catalogPdf';
import { planImages, defaultImageOptions } from '../lib/catalogPng';
import { MAX_SHARE_FILES } from '../lib/catalogImages';
import { cn } from '../lib/utils';

const STOCK = [['all', 'All'], ['in', 'In stock'], ['out', 'Out of stock']];
const IMG_TOGGLES = [['prices', 'Prices'], ['sizes', 'Sizes'], ['stock', 'Stock numbers'], ['hideSoldOut', 'Hide sold-out sizes'], ['skipNoPhoto', 'Skip products without a photo']];
const TOGGLES = [['photos', 'Photos'], ['prices', 'Prices'], ['sizes', 'Sizes'], ['stock', 'Stock status'], ['byCategory', 'Group by category']];

const isOut = (i) => i.stockCount != null && i.stockCount <= 0;

/** Choose what goes into the catalog PDF. items = products currently on screen. */
export default function CatalogExportSheet({ open, onClose, items, busy, onExport, onExportImages, progress, onCancel, selectedCount = 0 }) {
  const [tab, setTab] = useState('pdf');
  const [imgOpts, setImgOpts] = useState(defaultImageOptions);
  const [stock, setStock] = useState('all');
  const [cats, setCats] = useState(null); // null = every category
  const [opts, setOpts] = useState({ photos: true, prices: true, sizes: true, stock: true, byCategory: true });

  const categories = useMemo(() => [...new Set(items.map((i) => (i.category || '').trim() || 'Other'))].sort((a, b) => a.localeCompare(b)), [items]);
  const chosen = cats || categories;

  const list = useMemo(() => items.filter((i) => {
    if (stock === 'in' && isOut(i)) return false;
    if (stock === 'out' && !isOut(i)) return false;
    return chosen.includes((i.category || '').trim() || 'Other');
  }), [items, stock, chosen]);
  const cards = useMemo(() => groupCatalog(list).length, [list]);

  const plan = useMemo(() => planImages(list, imgOpts), [list, imgOpts]);
  const toggleCat = (c) => setCats((cur) => {
    const base = cur || categories;
    const next = base.includes(c) ? base.filter((x) => x !== c) : [...base, c];
    return next.length === categories.length ? null : next;
  });

  const pill = (on) => cn('rounded-full px-4 py-2 text-sm font-bold active:scale-95 transition-transform', on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700');

  return (
    <Drawer.Root handleOnly repositionInputs={false} open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content style={sheetStyle} aria-describedby={undefined} className="fixed bottom-0 left-0 right-0 z-[61] flex max-h-[85dvh] flex-col rounded-t-[24px] bg-white focus:outline-none">
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <Drawer.Title className="text-xl font-black text-slate-900">Export catalog</Drawer.Title>
            {selectedCount > 0 && <p className="-mt-4 text-sm font-semibold text-blue-700">{selectedCount} selected product{selectedCount === 1 ? '' : 's'}</p>}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
              {[['pdf', 'PDF'], ['images', 'Images']].map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                  className={cn('h-11 rounded-lg text-sm font-bold', tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>{l}</button>
              ))}
            </div>

            <section>
              <p className="mb-2 text-sm font-bold text-slate-700">Stock</p>
              <div className="flex flex-wrap gap-2">{STOCK.map(([v, l]) => <button key={v} type="button" onClick={() => setStock(v)} className={pill(stock === v)}>{l}</button>)}</div>
            </section>

            {categories.length > 1 && (
              <section>
                <p className="mb-2 text-sm font-bold text-slate-700">Categories</p>
                <div className="flex flex-wrap gap-2">{categories.map((c) => <button key={c} type="button" onClick={() => toggleCat(c)} className={pill(chosen.includes(c))}>{c}</button>)}</div>
              </section>
            )}

            {tab === 'images' && (
              <section>
                <p className="mb-2 text-sm font-bold text-slate-700">Show on each picture</p>
                <div className="flex flex-wrap gap-2">{IMG_TOGGLES.map(([k, l]) => <button key={k} type="button" aria-pressed={imgOpts[k]} onClick={() => setImgOpts((o) => ({ ...o, [k]: !o[k] }))} className={pill(imgOpts[k])}>{l}</button>)}</div>
                {imgOpts.stock && <p className="mt-2 text-xs font-semibold text-amber-700">Customers will see how many you have.</p>}
                {plan.skipped > 0 && <p className="mt-2 text-xs text-slate-500">{plan.skipped} product{plan.skipped === 1 ? '' : 's'} will be skipped (no photo).</p>}
                <p className="mt-2 text-xs text-slate-500">One picture per product colour. Cost price and supplier are never drawn.</p>
              </section>
            )}

            {tab === 'pdf' && (
            <section>
              <p className="mb-2 text-sm font-bold text-slate-700">Show on each card</p>
              <div className="flex flex-wrap gap-2">{TOGGLES.map(([k, l]) => <button key={k} type="button" aria-pressed={opts[k]} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))} className={pill(opts[k])}>{l}</button>)}</div>
              <p className="mt-2 text-xs text-slate-500">Cost price and supplier are never printed.</p>
            </section>
            )}
          </div>
          <div className="space-y-2 border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {tab === 'pdf' ? (
              <button type="button" disabled={busy || !cards} onClick={() => onExport({ items: list, options: opts, stock, cats })}
                className="h-14 w-full rounded-xl bg-blue-600 text-base font-bold text-white active:scale-95 transition-transform disabled:opacity-50">
                {busy ? 'Creating PDF...' : cards ? `Export ${cards} item${cards === 1 ? '' : 's'}` : 'Nothing to export'}
              </button>
            ) : progress ? (
              <div className="space-y-2">
                <p className="text-center text-sm font-bold text-slate-700" role="status">Making {Math.min(progress.done + 1, progress.total)} of {progress.total}...</p>
                <button type="button" onClick={onCancel} className="h-12 w-full rounded-xl bg-slate-100 font-bold text-slate-700">Cancel</button>
              </div>
            ) : (
              <>
                <button type="button" disabled={busy || !plan.cards.length || plan.cards.length > MAX_SHARE_FILES} onClick={() => onExportImages({ items: list, options: imgOpts, mode: 'share' })}
                  className="h-14 w-full rounded-xl bg-blue-600 text-base font-bold text-white active:scale-95 transition-transform disabled:opacity-50">
                  {plan.cards.length ? `Share ${plan.cards.length} picture${plan.cards.length === 1 ? '' : 's'}` : 'Nothing to export'}
                </button>
                {plan.cards.length > MAX_SHARE_FILES && <p className="text-center text-xs text-slate-500">Sharing takes up to {MAX_SHARE_FILES} at a time. Use the ZIP, or select fewer.</p>}
                <button type="button" disabled={busy || !plan.cards.length} onClick={() => onExportImages({ items: list, options: imgOpts, mode: 'zip' })}
                  className="h-12 w-full rounded-xl bg-slate-100 font-bold text-slate-800 disabled:opacity-50">Download all as ZIP</button>
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
