import { useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { groupCatalog } from '../lib/catalogPdf';
import { cn } from '../lib/utils';

const STOCK = [['all', 'All'], ['in', 'In stock'], ['out', 'Out of stock']];
const TOGGLES = [['photos', 'Photos'], ['prices', 'Prices'], ['sizes', 'Sizes'], ['stock', 'Stock status'], ['byCategory', 'Group by category']];

const isOut = (i) => i.stockCount != null && i.stockCount <= 0;

/** Choose what goes into the catalog PDF. items = products currently on screen. */
export default function CatalogExportSheet({ open, onClose, items, busy, onExport }) {
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
        <Drawer.Content style={sheetStyle} aria-describedby={undefined} className="fixed bottom-0 left-0 right-0 z-[61] flex max-h-[85vh] flex-col rounded-t-[24px] bg-white focus:outline-none">
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <Drawer.Title className="text-xl font-black text-slate-900">Export catalog PDF</Drawer.Title>

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

            <section>
              <p className="mb-2 text-sm font-bold text-slate-700">Show on each card</p>
              <div className="flex flex-wrap gap-2">{TOGGLES.map(([k, l]) => <button key={k} type="button" aria-pressed={opts[k]} onClick={() => setOpts((o) => ({ ...o, [k]: !o[k] }))} className={pill(opts[k])}>{l}</button>)}</div>
              <p className="mt-2 text-xs text-slate-500">Cost price and supplier are never printed.</p>
            </section>
          </div>
          <div className="border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button type="button" disabled={busy || !cards} onClick={() => onExport({ items: list, options: opts, stock, cats })}
              className="h-14 w-full rounded-xl bg-blue-600 text-base font-bold text-white active:scale-95 transition-transform disabled:opacity-50">
              {busy ? 'Creating PDF...' : cards ? `Export ${cards} item${cards === 1 ? '' : 's'}` : 'Nothing to export'}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
