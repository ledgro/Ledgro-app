import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, Search, X } from 'lucide-react';
import { useCatalogStore } from '../store/catalogStore';
import { useBodyLock } from '../hooks/useBodyLock';
import { formatCurrency } from '../lib/utils';
import CategoryChips from './CategoryChips';

const ALL = '__all__';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Search bar on the bill screen. Opens a full-screen sheet (also with Cmd/Ctrl+K). */
export default function SearchSheet({ onAddItem, onRemoveOne, cartQty, itemCount }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-slate-400 active:bg-slate-50"
        aria-haspopup="dialog"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
        <span className="flex-1">Search items</span>
        <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-400 md:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      {open && <Sheet onClose={() => setOpen(false)} onAddItem={onAddItem} onRemoveOne={onRemoveOne} cartQty={cartQty} itemCount={itemCount} />}
    </>
  );
}

function Sheet({ onClose, onAddItem, onRemoveOne, cartQty, itemCount }) {
  useBodyLock(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [customPrice, setCustomPrice] = useState('');
  const inputRef = useRef(null);
  const items = useCatalogStore((s) => s.items);
  const search = useCatalogStore((s) => s.search);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const active = useMemo(() => items.filter((i) => i.id && i.isActive !== false), [items]);
  const categories = useMemo(
    () => [...new Set(active.map((i) => (i.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [active]
  );
  const q = query.trim();
  const results = useMemo(() => {
    if (q) return search(q).filter((i) => i.isActive !== false);
    const pool = category === ALL ? active : active.filter((i) => (i.category || '').trim() === category);
    return [...pool].sort((a, b) => (b.frequency || 0) - (a.frequency || 0) || String(a.name).localeCompare(String(b.name))).slice(0, 60);
  }, [q, search, active, category]);

  const add = (p) => {
    onAddItem({
      name: p.name,
      unitPriceAtSale: p.lastUsedPrice || 0,
      catalogVersionTimestamp: p.updatedAt?.toMillis?.() || Date.now(),
      catalogId: p.id,
      qty: 1,
      unit: p.unit || 'unit',
    });
    inputRef.current?.select();
  };

  const addCustom = (e) => {
    e.preventDefault();
    const name = query.normalize('NFC').trim().slice(0, 99);
    const price = parseFloat(customPrice);
    if (!name || isNaN(price) || price <= 0) return;
    onAddItem({ name, unitPriceAtSale: Math.round(price * 100), unit: 'piece' });
    setQuery('');
    setCustomPrice('');
    inputRef.current?.focus();
  };

  const onInputKey = (e) => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      add(results[0]);
    }
  };

  // Portal to <body>: an ancestor with backdrop-filter would otherwise trap position:fixed.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Add items" className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            maxLength={100}
            placeholder="Search items"
            className="block h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-base font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          {query && (
            <button type="button" aria-label="Clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400">
              <X size={16} />
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">Close</button>
      </div>

      {!q && categories.length > 0 && (
        <div className="px-4 pt-3">
          <CategoryChips
            value={category}
            onChange={setCategory}
            options={[{ value: ALL, label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4" role="listbox" aria-label="Items">
        {!q && results.length > 0 && category === ALL && (
          <p className="pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-slate-400">Frequent</p>
        )}
        {q && results.length > 0 && (
          <p className="pb-1 pt-3 text-xs text-slate-400">{results.length} found · Enter adds the first</p>
        )}
        {results.map((p, idx) => {
          const stock = typeof p.stockCount === 'number' ? p.stockCount : null;
          const out = stock !== null && stock <= 0;
          const low = stock !== null && stock > 0 && stock <= (Number(p.lowStockAt) || 3);
          const inCart = cartQty.get(p.id) || 0;
          return (
            <div
              key={p.id}
              className={`flex items-center border-b border-slate-100 ${q && idx === 0 ? 'bg-slate-50' : ''}`}
            >
              <button
                type="button"
                onClick={() => add(p)}
                className="flex min-h-[60px] min-w-0 flex-1 items-center justify-between py-2 pl-1 text-left active:bg-slate-50"
              >
                <span className="min-w-0 flex-1 pr-3">
                  <span className={`block truncate text-base font-semibold ${out ? 'text-slate-400' : 'text-slate-900'}`}>{p.name}</span>
                  <span className="flex gap-2 text-xs">
                    {p.category && <span className="truncate text-slate-400">{p.category}</span>}
                    {out && <span className="font-semibold text-red-500">Out of stock</span>}
                    {low && <span className="font-semibold text-amber-600">{stock} left</span>}
                    {!out && !low && stock !== null && <span className="text-slate-400">{stock} in stock</span>}
                  </span>
                </span>
                <span className={`shrink-0 text-base tabular-nums ${out ? 'text-slate-400' : 'font-semibold text-slate-900'}`}>{formatCurrency(p.lastUsedPrice)}</span>
              </button>
              {inCart > 0 ? (
                <div className="ml-3 flex shrink-0 items-center rounded-lg border border-slate-200">
                  <button type="button" aria-label={`Remove one ${p.name}`} onClick={() => onRemoveOne(p.id)} className="flex h-10 w-10 items-center justify-center text-slate-600 active:bg-slate-100"><Minus size={16} /></button>
                  <span className="min-w-6 text-center text-sm font-bold tabular-nums">{inCart}</span>
                  <button type="button" aria-label={`Add one ${p.name}`} onClick={() => add(p)} className="flex h-10 w-10 items-center justify-center text-slate-600 active:bg-slate-100"><Plus size={16} /></button>
                </div>
              ) : (
                <button type="button" aria-label={`Add ${p.name}`} onClick={() => add(p)} className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white active:bg-slate-700"><Plus size={18} /></button>
              )}
            </div>
          );
        })}

        {q && results.length === 0 && (
          <form onSubmit={addCustom} className="pt-4">
            <p className="mb-3 text-sm text-slate-500">New item: <span className="font-semibold text-slate-900">{q}</span></p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="Price"
                  className="block h-12 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <button type="submit" disabled={!customPrice} className="h-12 rounded-xl bg-slate-900 px-6 text-sm font-bold text-white disabled:opacity-40">Add</button>
            </div>
          </form>
        )}

        {!q && results.length === 0 && <p className="pt-10 text-center text-slate-400">Type a name to add your first item.</p>}
      </div>

      <div className="border-t border-slate-100 p-4 pb-safe">
        <button type="button" onClick={onClose} className="h-12 w-full rounded-xl bg-blue-600 text-base font-bold text-white active:bg-blue-700">
          {itemCount > 0 ? `Done · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'Done'}
        </button>
      </div>
    </div>,
    document.body
  );
}
