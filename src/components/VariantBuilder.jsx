import { useState } from 'react';
import { MAX_AXES, MAX_COMBOS, buildCombos, comboKey, variantLabel } from '../lib/variants';

const field = 'w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900';

export function VariantBuilder({ axes, setAxes, comboStock, setComboStock }) {
  const combos = buildCombos(axes);
  const [sameStock, setSameStock] = useState('');
  const fillAll = () => {
    if (sameStock === '') return;
    setComboStock(Object.fromEntries(combos.map((opts) => [comboKey(opts), sameStock])));
  };
  const tooMany = combos.length > MAX_COMBOS;
  const setAxis = (i, patch) => setAxes(axes.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-3">
      {axes.map((a, i) => (
        <div key={i} className="grid grid-cols-[110px_1fr] gap-2">
          <input
            type="text" value={a.name} maxLength={20} onChange={(e) => setAxis(i, { name: e.target.value })}
            className={field} aria-label={`Option ${i + 1} name`}
          />
          <input
            type="text" value={a.values} maxLength={200} onChange={(e) => setAxis(i, { values: e.target.value })}
            className={field} aria-label={`Option ${i + 1} values, separated by commas`}
          />
        </div>
      ))}
      {axes.length < MAX_AXES && (
        <button type="button" onClick={() => setAxes([...axes, { name: '', values: '' }])} className="text-sm font-bold text-blue-600">
          Add option
        </button>
      )}
      <p className="text-xs text-slate-500">Name on the left (Size, Colour, anything). Values on the right, separated by commas.</p>
      {tooMany && <p className="text-sm font-semibold text-red-600">{combos.length} combinations. Up to {MAX_COMBOS} at a time.</p>}
      {combos.length > 0 && !tooMany && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Stock for each</p>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
            <span className="flex-1 pl-1 text-sm font-medium text-slate-600">Same stock for all</span>
            <input
              type="number" inputMode="decimal" min="0" step="1" value={sameStock}
              onChange={(e) => setSameStock(e.target.value.slice(0, 10))}
              className="w-20 px-2 text-center h-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
              aria-label="Same stock for all variants"
            />
            <button type="button" onClick={fillAll} disabled={sameStock === ''} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">Apply</button>
          </div>
          {combos.map((opts) => {
            const key = comboKey(opts);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{variantLabel(opts)}</span>
                <input
                  type="number" inputMode="decimal" min="0" step="1" value={comboStock[key] ?? ''}
                  onChange={(e) => setComboStock({ ...comboStock, [key]: e.target.value.slice(0, 10) })}
                  className="w-24 px-2 text-center h-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                  aria-label={`Stock for ${variantLabel(opts)}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VariantEditor({ options, setOptions }) {
  return (
    <div className="space-y-2">
      {Object.keys(options).map((axis) => (
        <div key={axis} className="grid grid-cols-[110px_1fr] gap-2 items-center">
          <span className="text-sm font-semibold text-slate-700 truncate">{axis}</span>
          <input
            type="text" value={options[axis]} maxLength={30}
            onChange={(e) => setOptions({ ...options, [axis]: e.target.value })}
            className={field}
          />
        </div>
      ))}
    </div>
  );
}
