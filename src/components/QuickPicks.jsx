import { useMemo } from 'react';
import { useCatalogStore } from '../store/catalogStore';
import ProductThumb from './ProductThumb';
import { formatCurrency } from '../lib/utils';

export const SEARCH_EVENT = 'ledgro:search';

/** Best sellers on an empty bill: one tap opens the search with that product ready. Products with sizes open on their size picker. */
export default function QuickPicks({ onAddItem }) {
  const items = useCatalogStore((s) => s.items);
  const picks = useMemo(() => {
    const seen = new Map();
    items
      .filter((i) => i.id && i.isActive !== false && (i.frequency || 0) > 0)
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .forEach((i) => {
        const key = i.groupId || i.id;
        if (!seen.has(key)) seen.set(key, { key, item: i, name: i.groupId ? (i.baseName || i.name) : i.name, group: !!i.groupId });
      });
    return [...seen.values()].slice(0, 8);
  }, [items]);

  if (picks.length === 0) return null;
  const tap = (p) => {
    if (p.group) { window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: { q: p.name } })); return; }
    onAddItem({ name: p.item.name, unitPriceAtSale: p.item.lastUsedPrice || 0, catalogVersionTimestamp: p.item.updatedAt?.toMillis?.() || Date.now(), catalogId: p.item.id, qty: 1, unit: p.item.unit || 'unit' });
  };
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Best sellers</p>
      <div className="grid grid-cols-2 gap-2">
        {picks.map((p) => (
          <button key={p.key} type="button" onClick={() => tap(p)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left active:bg-slate-50">
            <ProductThumb item={p.item} className="h-12 w-12" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
              <span className="block text-xs text-slate-500">{p.group ? 'Pick size' : formatCurrency(p.item.lastUsedPrice)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
