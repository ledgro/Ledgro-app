import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Minus, Plus, Search, X } from 'lucide-react';
import { useCatalogStore } from '../store/catalogStore';
import { useBodyLock } from '../hooks/useBodyLock';
import { formatCurrency } from '../lib/utils';
import { variantLabel } from '../lib/variants';
import CategoryChips from './CategoryChips';
import { SEARCH_EVENT } from './QuickPicks';

const ALL = '__all__';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Search bar on the bill screen. Opens a full-screen sheet (also with Cmd/Ctrl+K). */
export default function SearchSheet({ onAddItem, onRemoveOne, cartQty, itemCount }) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onSeed = (e) => { setSeed(e.detail?.q || ''); setOpen(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener(SEARCH_EVENT, onSeed);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(SEARCH_EVENT, onSeed); };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => { setSeed(''); setOpen(true); }}
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-slate-500 active:bg-slate-50"
        aria-haspopup="dialog"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
        <span className="flex-1">Search items</span>
        <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-500 md:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      {open && <Sheet seed={seed} onClose={() => { setOpen(false); setSeed(''); }} onAddItem={onAddItem} onRemoveOne={onRemoveOne} cartQty={cartQty} itemCount={itemCount} />}
    </>
  );
}

function Sheet({ seed, onClose, onAddItem, onRemoveOne, cartQty, itemCount }) {
  useBodyLock(true);
  const [query, setQuery] = useState(seed || '');
  const [category, setCategory] = useState(ALL);
  const [customPrice, setCustomPrice] = useState('');
  const [toggled, setToggled] = useState(() => new Set());
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

  // One row per product: sizes/options of the same product are grouped behind buttons.
  const rows = useMemo(() => {
    const out = [];
    const groups = new Map();
    results.forEach((p) => {
      if (!p.groupId) { out.push({ type: 'item', item: p }); return; }
      let g = groups.get(p.groupId);
      if (!g) {
        g = { type: 'group', groupId: p.groupId, baseName: p.baseName || p.name, category: p.category, items: [] };
        groups.set(p.groupId, g);
        out.push(g);
      }
      g.items.push(p);
    });
    return out;
  }, [results]);

  const toggleGroup = (id) => setToggled((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && rows.length > 0) {
      e.preventDefault();
      const first = rows[0];
      if (first.type === 'item') add(first.item);
      else if (first.items.length === 1) add(first.items[0]);
    }
  };

  // Portal to <body>: an ancestor with backdrop-filter would otherwise trap position:fixed.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Add items" style={{ bottom: 'var(--kb, 0px)' }} className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
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
            <button type="button" aria-label="Clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500">
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
          <p className="pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-slate-500">Frequent</p>
        )}
        {q && results.length > 0 && (
          <p className="pb-1 pt-3 text-xs text-slate-500">{results.length} found</p>
        )}
        {rows.map((row, idx) => {
          if (row.type === 'group') {
            return <VariantGroup key={row.groupId} row={row} expanded={q ? !toggled.has(row.groupId) : toggled.has(row.groupId)} onToggle={() => toggleGroup(row.groupId)} cartQty={cartQty} onAdd={add} onRemoveOne={onRemoveOne} highlight={!!q && idx === 0} />;
          }
          const p = row.item;
          const stock = typeof p.stockCount === 'number' ? p.stockCount : null;
          const out = stock !== null && stock <= 0;
          const low = stock !== null && stock > 0 && stock <= (Number(p.lowStockAlert) || 3);
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
                  <span className={`block truncate text-base font-semibold ${out ? 'text-slate-500' : 'text-slate-900'}`}>{p.name}</span>
                  <span className="flex gap-2 text-xs">
                    {p.category && <span className="truncate text-slate-500">{p.category}</span>}
                    {out && <span className="font-semibold text-red-500">Out of stock</span>}
                    {low && <span className="font-semibold text-amber-600">{stock} left</span>}
                    {!out && !low && stock !== null && <span className="text-slate-500">{stock} in stock</span>}
                  </span>
                </span>
                <span className={`shrink-0 text-base tabular-nums ${out ? 'text-slate-500' : 'font-semibold text-slate-900'}`}>{formatCurrency(p.lastUsedPrice)}</span>
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
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
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

        {!q && results.length === 0 && <p className="pt-10 text-center text-slate-500">Type a name to add your first item.</p>}
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

function VariantGroup({ row, expanded, onToggle, cartQty, onAdd, onRemoveOne, highlight }) {
  const prices = row.items.map((i) => i.lastUsedPrice || 0);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const samePrice = lo === hi;
  const inCartTotal = row.items.reduce((n, i) => n + (cartQty.get(i.id) || 0), 0);
  return (
    <div className={`border-b border-slate-100 ${highlight ? 'bg-slate-50' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-[60px] w-full items-center justify-between py-2 pl-1 text-left active:bg-slate-50"
      >
        <span className="min-w-0 flex-1 pr-3">
          <span className="block truncate text-base font-semibold text-slate-900">{row.baseName}</span>
          <span className="flex gap-2 text-xs text-slate-500">
            {row.category && <span className="truncate">{row.category}</span>}
            <span>{row.items.length} {row.items.length === 1 ? 'option' : 'options'}</span>
          </span>
        </span>
        {inCartTotal > 0 && <span className="mr-3 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">{inCartTotal}</span>}
        <span className="shrink-0 text-base font-semibold tabular-nums text-slate-900">{samePrice ? formatCurrency(lo) : `from ${formatCurrency(lo)}`}</span>
        <ChevronDown size={18} className={`ml-2 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="grid grid-cols-3 gap-2 pb-3 pl-1">
          {row.items.map((p) => {
            const stock = typeof p.stockCount === 'number' ? p.stockCount : null;
            const out = stock !== null && stock <= 0;
            const n = cartQty.get(p.id) || 0;
            return (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => onAdd(p)}
                  aria-label={`Add ${p.name}`}
                  className={`flex h-16 w-full flex-col items-center justify-center rounded-xl border px-1 text-center active:scale-95 transition-transform ${n > 0 ? 'border-slate-900 bg-slate-900 text-white' : out ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-slate-200 bg-white text-slate-900'}`}
                >
                  <span className="max-w-full truncate text-base font-bold">{variantLabel(p.options) || p.name}</span>
                  <span className={`text-xs ${n > 0 ? 'text-slate-300' : out ? 'text-red-500' : 'text-slate-500'}`}>
                    {out ? 'Out' : stock !== null ? `${stock} left` : ''}{!samePrice ? `${stock !== null || out ? ' · ' : ''}${formatCurrency(p.lastUsedPrice)}` : ''}
                  </span>
                </button>
                {n > 0 && (
                  <>
                    <span className="pointer-events-none absolute -right-1 -top-1 min-w-5 rounded-full bg-blue-600 px-1 text-center text-xs font-bold text-white">{n}</span>
                    <button
                      type="button"
                      aria-label={`Remove one ${p.name}`}
                      onClick={() => onRemoveOne(p.id)}
                      className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm"
                    >
                      <Minus size={12} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
