import fs from 'fs';

let content = fs.readFileSync('src/components/DiscountDrawer.jsx', 'utf-8');

const newDrawer = `import { useState, useEffect } from 'react';
import { Drawer } from 'vaul';

export default function DiscountDrawer({ isOpen, onClose, targetItem, globalDiscount, dispatch }) {
  const [discountType, setDiscountType] = useState('flat'); // 'flat' | 'percent'
  const [discountValue, setDiscountValue] = useState('');

  // Hydrate local state when drawer opens
  useEffect(() => {
    if (isOpen) {
      if (targetItem && targetItem.lineDiscount) {
        setDiscountType(targetItem.lineDiscount.type || 'flat');
        let val = targetItem.lineDiscount.value || 0;
        if ((targetItem.lineDiscount.type || 'flat') === 'flat' && val > 0) val = val / 100;
        setDiscountValue(val > 0 ? val.toString() : '');
      } else if (!targetItem && globalDiscount) {
        setDiscountType(globalDiscount.type || 'flat');
        let val = globalDiscount.value || 0;
        if ((globalDiscount.type || 'flat') === 'flat' && val > 0) val = val / 100;
        setDiscountValue(val > 0 ? val.toString() : '');
      } else {
        setDiscountType('flat');
        setDiscountValue('');
      }
    }
  }, [isOpen, targetItem, globalDiscount]);

  const handleApply = (e) => {
    if (e) e.preventDefault();
    let val = parseFloat(discountValue) || 0;

    if (val <= 0 || isNaN(val)) return;

    if (discountType === 'percent') {
       val = Math.min(Math.max(0, val), 100);
    } else {
       val = Math.round(val * 100);

       // Optional: Pre-clamp in UI to prevent confusion
       if (targetItem) {
          const rawTotal = (targetItem.unitPriceAtSale ?? targetItem.unitPrice ?? 0) * (targetItem.qty || 1);
          val = Math.min(val, rawTotal);
       }
    }

    if (targetItem) {
      dispatch({
        type: 'SET_LINE_DISCOUNT',
        payload: { id: targetItem.id, discount: { type: discountType, value: val } }
      });
    } else {
      dispatch({
        type: 'SET_GLOBAL_DISCOUNT',
        payload: { type: discountType, value: val }
      });
    }
    onClose();
  };

  const handleRemove = (e) => {
    if (e) e.preventDefault();
    if (targetItem) {
      dispatch({
        type: 'SET_LINE_DISCOUNT',
        payload: { id: targetItem.id, discount: { type: 'flat', value: 0 } }
      });
    } else {
      dispatch({
        type: 'SET_GLOBAL_DISCOUNT',
        payload: { type: 'flat', value: 0 }
      });
    }
    onClose();
  };

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()} repositionInputs={true}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
        <Drawer.Content className="bg-white flex flex-col rounded-t-[24px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-[60] focus:outline-none">
          <div className="p-4 bg-white rounded-t-[24px] flex-1 pb-safe">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-6" />
            <div className="max-w-md mx-auto">
              <Drawer.Title className="font-bold text-slate-900 mb-1 text-xl truncate px-2">
                {targetItem ? \`Discount for \${targetItem.name}\` : 'Bill Discount'}
              </Drawer.Title>
              <Drawer.Description className="sr-only">
                Set a flat or percentage discount.
              </Drawer.Description>

              <form onSubmit={handleApply} className="mt-4">
                <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => { setDiscountType('flat'); setDiscountValue(''); }}
                    aria-pressed={discountType === 'flat'}
                    className={\`flex-1 py-2 text-sm font-bold rounded-lg transition-all \${
                      discountType === 'flat' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                    }\`}
                  >
                    Flat Amount (₹)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDiscountType('percent'); setDiscountValue(''); }}
                    aria-pressed={discountType === 'percent'}
                    className={\`flex-1 py-2 text-sm font-bold rounded-lg transition-all \${
                      discountType === 'percent' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                    }\`}
                  >
                    Percentage (%)
                  </button>
                </div>

                <div className="relative mb-8">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-500 font-bold text-lg">
                      {discountType === 'flat' ? '₹' : ''}
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    max={discountType === 'percent' ? "100" : undefined}
                    min="0"
                    step="0.01"
                    aria-label={\`Discount \${discountType}\`}
                    className="block w-full pl-8 pr-12 h-14 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xl font-bold transition-all shadow-sm"
                    placeholder="0.00"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <span className="text-slate-500 font-bold text-lg">
                      {discountType === 'percent' ? '%' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 pb-2">
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="flex-1 h-14 bg-red-50 text-red-600 font-bold rounded-xl active:bg-red-100 transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    type="submit"
                    disabled={!discountValue || parseFloat(discountValue) <= 0 || isNaN(parseFloat(discountValue))}
                    className="flex-[2] h-14 bg-blue-600 text-white font-bold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    Apply Discount
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
`;

fs.writeFileSync('src/components/DiscountDrawer.jsx', newDrawer);
