import { memo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ProductThumb from './ProductThumb';
import { sizeLabelOf } from '../lib/variants';
import { formatCurrency, cn } from '../lib/utils';

const stockTone = (it) => {
  if (it.stockCount == null) return 'text-slate-400';
  if (it.stockCount <= 0) return 'text-red-600';
  if (it.lowStockAlert != null && it.stockCount <= it.lowStockAlert) return 'text-amber-600';
  return 'text-green-700';
};

/** One product with variants: colours inside, each with its own photo and size chips. */
function ProductGroupCard({ entry, onOpen, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const { name, items, colours } = entry;
  const prices = items.map((i) => Number(i.lastUsedPrice) || 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const tracked = items.filter((i) => i.stockCount != null);
  const total = tracked.reduce((a, i) => a + Math.max(0, i.stockCount), 0);
  const namedColours = colours.filter((c) => c.colour).length;
  const sizes = new Set(items.map(sizeLabelOf)).size;
  const meta = [
    namedColours > 1 ? `${namedColours} colours` : null,
    `${sizes} size${sizes === 1 ? '' : 's'}`,
    tracked.length ? `${total} in stock` : null,
  ].filter(Boolean).join(' · ');
  const lead = colours.find((c) => c.rep?.hasImage)?.rep || colours[0].rep;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-4 p-4 text-left active:bg-slate-50">
        <ProductThumb item={lead} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-slate-900">{name}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">{meta}</p>
          <p className="mt-1 text-sm font-extrabold text-blue-600">{min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`}</p>
        </div>
        <ChevronDown size={20} className={cn('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && colours.map(({ colour, items: list, rep }) => (
        <div key={colour || '_'} className="flex items-start gap-4 border-t border-slate-100 p-4">
          <ProductThumb item={rep} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            {colour && <p className="mb-2.5 text-sm font-bold text-slate-900">{colour}</p>}
            <div className="flex flex-wrap gap-2.5">
              {list.map((it) => (
                <button key={it.id} type="button" onClick={() => onOpen(it)}
                  className={cn('min-w-[3.5rem] rounded-xl border border-slate-200 px-3 py-2 text-center active:scale-95 transition-transform', it.stockCount != null && it.stockCount <= 0 && 'opacity-50')}>
                  <span className={cn('block text-sm font-bold text-slate-900', it.stockCount != null && it.stockCount <= 0 && 'line-through')}>{sizeLabelOf(it)}</span>
                  <span className={cn('mt-0.5 block text-[0.7rem] font-semibold', stockTone(it))}>{it.stockCount == null ? '-' : it.stockCount <= 0 ? 'Out' : it.stockCount}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default memo(ProductGroupCard);
