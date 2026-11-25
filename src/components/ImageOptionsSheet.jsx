import { Drawer } from 'vaul';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { sizeLabelOf, colourOf } from '../lib/variants';
import { formatCurrency, cn } from '../lib/utils';

const SWITCHES = [['prices', 'Price'], ['sizes', 'Sizes'], ['stock', 'Stock numbers']];
const SAMPLE = { name: 'Product name', price: 1299, sizes: [['7', 4], ['8', 2], ['9', 6]] };

/** Small sheet: three switches and a live preview of what a picture will show. `sample` = the first picked product's sizes. */
export default function ImageOptionsSheet({ open, onClose, prefs, onChange, sample }) {
  const real = sample?.length ? {
    name: [sample[0].baseName || sample[0].name, colourOf(sample[0])].filter(Boolean).join(' - '),
    price: Math.min(...sample.map((i) => Number(i.lastUsedPrice) || 0)),
    sizes: sample.filter((i) => i.stockCount == null || i.stockCount > 0).slice(0, 8).map((i) => [sizeLabelOf(i), i.stockCount]),
  } : SAMPLE;
  return (
    <Drawer.Root handleOnly repositionInputs={false} open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content style={sheetStyle} aria-describedby={undefined} className="fixed bottom-0 left-0 right-0 z-[61] flex max-h-[85dvh] flex-col rounded-t-[24px] bg-white focus:outline-none">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <Drawer.Title className="text-xl font-black text-slate-900">Show on pictures</Drawer.Title>
            <div className="space-y-1">
              {SWITCHES.map(([k, l]) => (
                <button key={k} type="button" role="switch" aria-checked={!!prefs[k]} aria-label={l} onClick={() => onChange({ ...prefs, [k]: !prefs[k] })} className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left">
                  <span className="text-base font-semibold text-slate-800">{l}</span>
                  <span aria-hidden="true" className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', prefs[k] ? 'bg-blue-600' : 'bg-slate-300')}>
                    <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', prefs[k] ? 'left-[1.375rem]' : 'left-0.5')} />
                  </span>
                </button>
              ))}
            </div>
            {prefs.stock && <p className="text-xs font-semibold text-amber-700">Customers will see how many you have.</p>}
            <div className="rounded-2xl border border-slate-200 p-3" aria-label="Preview">
              <div className="flex h-24 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-400">Photo</div>
              <p className="mt-2 truncate text-sm font-bold text-slate-900">{real.name}</p>
              {prefs.prices && <p className="text-sm font-extrabold text-blue-600">{formatCurrency(real.price)}</p>}
              {prefs.sizes && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {real.sizes.map(([s, n]) => (
                    <span key={s} className={cn('rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-800')}>
                      {s}{prefs.stock && n != null ? ` · ${n}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">Sold-out sizes are left off. Cost price and supplier are never drawn.</p>
          </div>
          <div className="border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} className="h-14 w-full rounded-xl bg-blue-600 text-base font-bold text-white">Done</button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
