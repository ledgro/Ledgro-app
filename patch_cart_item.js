import fs from 'fs';

let content = fs.readFileSync('src/components/CartItem.jsx', 'utf-8');

// Fix 1: Input filtering, blur handling, formatting, labels, touch targets, step unit decrement
const cartItemCode = `import { Minus, Plus, Tag, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatCurrency } from '../lib/utils';
import { toast } from 'sonner';

export default function CartItem({ item, dispatch, onOpenDiscount }) {
  const [localQty, setLocalQty] = useState(item.qty.toString());

  // Sync if external state changes
  useEffect(() => {
    setLocalQty(item.qty.toString());
  }, [item.qty]);

  const handleQtyChange = (val) => {
    // Strip everything except digits and one dot
    let cleanVal = val.replace(/[^0-9.]/g, '');
    const parts = cleanVal.split('.');
    if (parts.length > 2) {
      cleanVal = parts[0] + '.' + parts.slice(1).join('');
    }
    // Limit to 3 decimal places
    if (parts[1] && parts[1].length > 3) {
      cleanVal = parts[0] + '.' + parts[1].slice(0, 3);
    }

    // Cap at 9999
    if (parseFloat(cleanVal) > 9999) cleanVal = '9999';

    setLocalQty(cleanVal);

    if (cleanVal !== '' && !cleanVal.endsWith('.')) {
      const qty = parseFloat(cleanVal);
      if (!isNaN(qty) && qty > 0) {
        dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty } });
      }
    }
  };

  const handleQtyBlur = () => {
    const qty = parseFloat(localQty);
    if (isNaN(qty) || qty <= 0) {
      setLocalQty('1');
      dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty: 1 } });
    } else {
      setLocalQty(qty.toString());
      dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty } });
    }
  };

  const increment = () => {
    const currentQty = parseFloat(item.qty) || 0;
    const step = item.unit === 'kg' || item.unit === 'l' ? 0.5 : 1;
    dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty: currentQty + step } });
  };

  const decrement = () => {
    const currentQty = parseFloat(item.qty) || 0;
    const step = item.unit === 'kg' || item.unit === 'l' ? 0.5 : 1;
    const min = item.unit === 'kg' || item.unit === 'l' ? 0.1 : 1;
    if (currentQty - step >= min) {
      dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty: currentQty - step } });
    }
  };

  const remove = () => {
    dispatch({ type: 'REMOVE_ITEM', payload: { id: item.id }});
    toast('Item removed', {
      action: {
        label: 'Undo',
        onClick: () => dispatch({ type: 'ADD_ITEM', payload: item })
      }
    });
  };

  const hasDiscount = item.lineDiscount && item.lineDiscount.value > 0;
  const priceToFormat = item.unitPriceAtSale ?? item.unitPrice ?? 0;

  return (
    <div className="py-4 border-b border-slate-100 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-4">
          <h3 className="font-semibold text-slate-900 leading-tight">{item.name}</h3>
          <p className="text-sm text-slate-500 mt-1">{formatCurrency(priceToFormat)} per {item.unit || 'unit'}</p>
        </div>

        <div className="text-right">
          {hasDiscount && (
            <span className="text-xs text-slate-400 line-through block mb-1">
              {formatCurrency(item.rawTotal)}
            </span>
          )}
          <span className="font-bold text-slate-900 text-lg block tabular-nums-money">
            {formatCurrency(item.finalLineTotal)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 bg-slate-50 rounded-lg border border-slate-200 p-1">
          <button
            onClick={decrement}
            aria-label="Decrease quantity"
            className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-md active:bg-slate-300 transition-colors"
          >
            <Minus size={18} />
          </button>

          <input
            type="text"
            inputMode="decimal"
            value={localQty}
            aria-label="Quantity"
            onChange={(e) => handleQtyChange(e.target.value)}
            onBlur={handleQtyBlur}
            className="w-14 text-center bg-transparent border-none focus:ring-0 font-medium text-slate-900 p-0"
          />

          <button
            onClick={increment}
            aria-label="Increase quantity"
            className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-md active:bg-slate-300 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenDiscount(item)}
            className={\`flex items-center gap-1 px-4 py-2 h-10 rounded-full text-xs font-bold border transition-colors \${
              hasDiscount
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }\`}
          >
            <Tag size={14} />
            {hasDiscount
              ? \`-\${item.lineDiscount.type === 'percent' ? item.lineDiscount.value + '%' : formatCurrency(item.lineDiscount.value)}\`
              : 'Discount'}
          </button>

          <button
            onClick={remove}
            aria-label="Remove item"
            className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}`;

fs.writeFileSync('src/components/CartItem.jsx', cartItemCode);
