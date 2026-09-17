import { Minus, Plus, Tag, Trash2 } from 'lucide-react';

export default function CartItem({ item, dispatch, onOpenDiscount }) {

  const handleQtyChange = (newQtyStr) => {
    // Allows empty string while typing, otherwise parse float
    if (newQtyStr === '') {
      dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty: '' } });
      return;
    }

    const qty = parseFloat(newQtyStr);
    if (!isNaN(qty) && qty >= 0) {
      dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty } });
    }
  };

  const handleQtyBlur = () => {
    // Reset to 1 if left totally empty or invalid
    if (!item.qty || isNaN(item.qty) || item.qty <= 0) {
      dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty: 1 } });
    }
  };

  const increment = () => {
    const currentQty = parseFloat(item.qty) || 0;
    dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty: currentQty + 1 } });
  };

  const decrement = () => {
    const currentQty = parseFloat(item.qty) || 0;
    if (currentQty > 1) {
      dispatch({ type: 'UPDATE_QTY', payload: { id: item.id, qty: currentQty - 1 } });
    }
  };

  const remove = () => {
    dispatch({ type: 'REMOVE_ITEM', payload: { id: item.id }});
  };

  const hasDiscount = item.lineDiscount && item.lineDiscount.value > 0;

  return (
    <div className="py-4 border-b border-gray-100 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 pr-4">
          <h3 className="font-semibold text-gray-900 leading-tight">{item.name}</h3>
          <p className="text-sm text-gray-500 mt-1">₹{item.unitPrice} per unit</p>
        </div>

        <div className="text-right">
          {hasDiscount && (
            <span className="text-xs text-gray-400 line-through block mb-1">
              ₹{item.rawTotal}
            </span>
          )}
          <span className="font-bold text-gray-900 text-lg block">
            ₹{item.finalLineTotal}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-1">
          <button
            onClick={decrement}
            className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-md active:bg-gray-300 transition-colors"
          >
            <Minus size={18} />
          </button>

          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            value={item.qty}
            onChange={(e) => handleQtyChange(e.target.value)}
            onBlur={handleQtyBlur}
            className="w-12 text-center bg-transparent border-none focus:ring-0 font-medium text-gray-900 p-0"
          />

          <button
            onClick={increment}
            className="p-1.5 text-gray-600 hover:bg-gray-200 rounded-md active:bg-gray-300 transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenDiscount(item)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              hasDiscount
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Tag size={14} />
            {hasDiscount
              ? `-${item.lineDiscount.type === 'percent' ? item.lineDiscount.value + '%' : '₹' + item.lineDiscount.value}`
              : 'Discount'}
          </button>

          <button
            onClick={remove}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
