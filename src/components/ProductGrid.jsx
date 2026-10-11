import { useMemo, useState } from 'react';

const ALL = '__all__';
const MAX_TILES = 120;

const rupees = (paise) =>
  `₹${((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Tap-to-add product tiles for the empty bill screen.
 * Category chips only appear for categories the shop actually uses; products
 * without a category are only shown under "All".
 */
export default function ProductGrid({ items, onAdd }) {
  const [active, setActive] = useState(ALL);

  const products = useMemo(
    () =>
      (items || [])
        .filter((i) => i.id && i.isActive !== false)
        .sort((a, b) => (b.frequency || 0) - (a.frequency || 0) || String(a.name).localeCompare(String(b.name))),
    [items]
  );

  const categories = useMemo(() => {
    const counts = new Map();
    products.forEach((p) => {
      const c = (p.category || '').trim();
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    });
    return [...counts.keys()].sort((a, b) => a.localeCompare(b));
  }, [products]);

  if (products.length === 0) return null;

  const current = categories.includes(active) ? active : ALL;
  const shown = (current === ALL ? products : products.filter((p) => (p.category || '').trim() === current)).slice(0, MAX_TILES);

  const chip = (value, label) => (
    <button
      key={value}
      type="button"
      onClick={() => setActive(value)}
      aria-pressed={current === value}
      className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        current === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 active:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="Products" className="px-4 pb-4">
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
          {chip(ALL, 'All')}
          {categories.map((c) => chip(c, c))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {shown.map((p) => {
          const out = typeof p.stockCount === 'number' && p.stockCount <= 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                onAdd({
                  name: p.name,
                  unitPriceAtSale: p.lastUsedPrice || 0,
                  catalogVersionTimestamp: p.updatedAt?.toMillis?.() || Date.now(),
                  catalogId: p.id,
                  qty: 1,
                  unit: p.unit || 'unit',
                })
              }
              className={`flex min-h-[64px] flex-col items-start justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                out ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white text-slate-800 active:bg-slate-100'
              }`}
            >
              <span className="w-full truncate text-sm font-semibold">{p.name}</span>
              <span className="flex w-full items-center justify-between text-xs">
                <span className={out ? 'text-slate-400' : 'font-bold text-blue-600'}>{rupees(p.lastUsedPrice)}</span>
                {out && <span className="font-semibold text-red-400">Out</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
