import { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { useBodyLock } from '../hooks/useBodyLock';

export default function DiscountDrawer({ isOpen, onClose, targetItem, dispatch }) {
  useBodyLock(isOpen);
  const [discountType, setDiscountType] = useState('flat'); // 'flat' | 'percent'
  const [discountValue, setDiscountValue] = useState('');

  // Hydrate local state when drawer opens
  useEffect(() => {
    if (isOpen) {
      if (targetItem && targetItem.lineDiscount) {
        setDiscountType(targetItem.lineDiscount.type);
        setDiscountValue(targetItem.lineDiscount.value > 0 ? targetItem.lineDiscount.value.toString() : '');
      } else {
        setDiscountType('flat');
        setDiscountValue('');
      }
    }
  }, [isOpen, targetItem]);

  const handleApply = () => {
    const val = parseFloat(discountValue) || 0;

    if (targetItem) {
      // Line discount
      dispatch({
        type: 'SET_LINE_DISCOUNT',
        payload: { id: targetItem.id, discount: { type: discountType, value: val } }
      });
    } else {
      // Global discount
      dispatch({
        type: 'SET_GLOBAL_DISCOUNT',
        payload: { type: discountType, value: val }
      });
    }
    onClose();
  };

  const handleRemove = () => {
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
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="bg-white flex flex-col rounded-t-[10px] mt-24 h-auto fixed bottom-0 left-0 right-0 z-50 focus:outline-none">
          <div className="p-4 bg-white rounded-t-[10px] flex-1">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-300 mb-6" />
            <div className="max-w-md mx-auto">
              <Drawer.Title className="font-bold text-gray-900 mb-4 text-xl">
                {targetItem ? `Discount for ${targetItem.name}` : 'Bill Discount'}
              </Drawer.Title>

              <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
                <button
                  onClick={() => setDiscountType('flat')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    discountType === 'flat' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Flat Amount (₹)
                </button>
                <button
                  onClick={() => setDiscountType('percent')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    discountType === 'percent' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Percentage (%)
                </button>
              </div>

              <div className="relative mb-8">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-gray-500 font-medium text-lg">
                    {discountType === 'flat' ? '₹' : ''}
                  </span>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="block w-full pl-8 pr-12 py-4 border-2 border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-0 text-xl font-bold"
                  placeholder="0.00"
                  autoFocus
                />
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <span className="text-gray-500 font-medium text-lg">
                    {discountType === 'percent' ? '%' : ''}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mb-6 pb-safe">
                <button
                  onClick={handleRemove}
                  className="flex-1 py-4 bg-red-50 text-red-600 font-bold rounded-xl active:bg-red-100 transition-colors"
                >
                  Remove
                </button>
                <button
                  onClick={handleApply}
                  className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-xl active:bg-indigo-700 transition-colors"
                >
                  Apply Discount
                </button>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
