import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useCatalogStore } from '../store/catalogStore';
import { formatCurrency } from '../lib/utils';

const box = 'w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 bg-white';

export default function ExchangePicker({ lines, setLines, oldUnitPrice }) {
  const [query, setQuery] = useState('');
  const search = useCatalogStore((s) => s.search);
  const results = useMemo(() => (query.trim() ? search(query).filter((i) => i.id && i.isActive !== false).slice(0, 6) : []), [query, search]);

  const add = (p) => {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.catalogId === p.id);
      if (at !== -1) return prev.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { catalogId: p.id, name: p.name, unit: p.unit || 'unit', unitPrice: p.lastUsedPrice || 0, qty: 1 }];
    });
    setQuery('');
  };
  const patch = (i, next) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...next } : l)));

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-slate-700">Give instead (optional)</p>
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} className={box} aria-label="Search replacement item" />
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => add(p)} className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-slate-50">
              <span className="font-semibold text-slate-900 truncate pr-3">{p.name}</span>
              <span className="text-sm font-bold text-slate-500 shrink-0">{formatCurrency(p.lastUsedPrice || 0)}</span>
            </button>
          ))}
        </div>
      )}
      {lines.map((l, i) => (
        <div key={l.catalogId} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-slate-900">{l.name}</p>
            <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove ${l.name}`} className="text-slate-500 p-1"><X size={18} /></button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => patch(i, { qty: Math.max(1, l.qty - 1) })} className="w-8 h-8 rounded-full bg-slate-100 font-black">-</button>
              <span className="font-bold w-5 text-center">{l.qty}</span>
              <button type="button" onClick={() => patch(i, { qty: l.qty + 1 })} className="w-8 h-8 rounded-full bg-slate-100 font-black">+</button>
            </div>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={l.unitPrice === '' ? '' : l.unitPrice / 100}
                onChange={(e) => patch(i, { unitPrice: e.target.value === '' ? '' : Math.round(parseFloat(e.target.value.slice(0, 10)) * 100) || 0 })}
                className="w-full pl-7 pr-3 h-10 border border-slate-200 rounded-xl font-bold text-slate-900"
                aria-label={`Price of ${l.name}`}
              />
            </div>
          </div>
        </div>
      ))}
      {lines.length > 0 && oldUnitPrice > 0 && (
        <button type="button" onClick={() => setLines((prev) => prev.map((l) => ({ ...l, unitPrice: oldUnitPrice })))} className="text-sm font-bold text-blue-600">
          Same price as the returned item ({formatCurrency(oldUnitPrice)})
        </button>
      )}
    </div>
  );
}
