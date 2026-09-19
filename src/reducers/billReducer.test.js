import { describe, it, expect } from 'vitest';
import { billReducer, initialBillState, calculateBillTotals } from './billReducer';

describe('billReducer', () => {
  it('should return initial state', () => {
    expect(billReducer(undefined, {})).toEqual(initialBillState);
  });

  it('should handle ADD_ITEM', () => {
    const item = { name: 'Item 1', unitPrice: 10, qty: 1 };
    const state = billReducer(initialBillState, { type: 'ADD_ITEM', payload: item });
    expect(state.items.length).toBe(1);
    expect(state.items[0].name).toBe('Item 1');
    expect(state.items[0].qty).toBe(1);
  });

  it('should increment qty for existing item on ADD_ITEM', () => {
    const item = { name: 'Item 1', unitPrice: 10, qty: 1 };
    let state = billReducer(initialBillState, { type: 'ADD_ITEM', payload: item });
    state = billReducer(state, { type: 'ADD_ITEM', payload: item });
    expect(state.items.length).toBe(1);
    expect(state.items[0].qty).toBe(2);
  });

  it('should handle UPDATE_QTY', () => {
    const item = { name: 'Item 1', unitPrice: 10, qty: 1 };
    let state = billReducer(initialBillState, { type: 'ADD_ITEM', payload: item });
    const itemId = state.items[0].id;
    state = billReducer(state, { type: 'UPDATE_QTY', payload: { id: itemId, qty: 5 } });
    expect(state.items[0].qty).toBe(5);
  });

  it('should handle REMOVE_ITEM', () => {
    const item = { name: 'Item 1', unitPrice: 10, qty: 1 };
    let state = billReducer(initialBillState, { type: 'ADD_ITEM', payload: item });
    const itemId = state.items[0].id;
    state = billReducer(state, { type: 'REMOVE_ITEM', payload: { id: itemId } });
    expect(state.items.length).toBe(0);
  });

  it('should handle SET_LINE_DISCOUNT', () => {
    const item = { name: 'Item 1', unitPrice: 100, qty: 1 };
    let state = billReducer(initialBillState, { type: 'ADD_ITEM', payload: item });
    const itemId = state.items[0].id;
    state = billReducer(state, { type: 'SET_LINE_DISCOUNT', payload: { id: itemId, discount: { type: 'flat', value: 10 } } });
    expect(state.items[0].lineDiscount).toEqual({ type: 'flat', value: 10 });
  });

  it('should handle SET_GLOBAL_DISCOUNT', () => {
    const state = billReducer(initialBillState, { type: 'SET_GLOBAL_DISCOUNT', payload: { type: 'percent', value: 15 } });
    expect(state.globalDiscount).toEqual({ type: 'percent', value: 15 });
  });

  it('should handle CLEAR_BILL', () => {
    const item = { name: 'Item 1', unitPrice: 10, qty: 1 };
    let state = billReducer(initialBillState, { type: 'ADD_ITEM', payload: item });
    state = billReducer(state, { type: 'CLEAR_BILL' });
    expect(state).toEqual(initialBillState);
  });

  it('should handle INIT_FROM_EDIT', () => {
    const payload = {
      items: [{ name: 'Item 1', unitPrice: 10, qty: 2 }],
      globalDiscount: { type: 'percent', value: 5 }
    };
    const state = billReducer(initialBillState, { type: 'INIT_FROM_EDIT', payload });
    expect(state.items.length).toBe(1);
    expect(state.items[0].id).toBeDefined(); // Should generate a new UI ID
    expect(state.items[0].lineDiscount).toEqual({ type: 'flat', value: 0 }); // Fallback
    expect(state.globalDiscount).toEqual({ type: 'percent', value: 5 });
  });
});

describe('calculateBillTotals', () => {
  it('should calculate empty state correctly', () => {
    const totals = calculateBillTotals(initialBillState);
    expect(totals.subtotal).toBe(0);
    expect(totals.globalDiscountAmt).toBe(0);
    expect(totals.grandTotal).toBe(0);
    expect(totals.items.length).toBe(0);
  });

  it('should calculate standard bill correctly and round raw totals', () => {
    const state = {
      items: [
        { id: '1', name: 'Item 1', unitPrice: 10.4, qty: 1, lineDiscount: { type: 'flat', value: 0 } },
        { id: '2', name: 'Item 2', unitPrice: 20.6, qty: 1, lineDiscount: { type: 'flat', value: 0 } },
      ],
      globalDiscount: { type: 'flat', value: 0 }
    };
    const totals = calculateBillTotals(state);

    // 10.4 rounds to 10. 20.6 rounds to 21. Subtotal = 31.
    expect(totals.items[0].rawTotal).toBe(10);
    expect(totals.items[1].rawTotal).toBe(21);
    expect(totals.subtotal).toBe(31);
    expect(totals.grandTotal).toBe(31);
  });

  it('should apply flat and percent line discounts', () => {
    const state = {
      items: [
        { id: '1', name: 'Item 1', unitPrice: 100, qty: 1, lineDiscount: { type: 'flat', value: 15 } },
        { id: '2', name: 'Item 2', unitPrice: 200, qty: 1, lineDiscount: { type: 'percent', value: 10 } },
      ],
      globalDiscount: { type: 'flat', value: 0 }
    };
    const totals = calculateBillTotals(state);

    // Item 1: 100 - 15 = 85
    expect(totals.items[0].finalLineTotal).toBe(85);

    // Item 2: 200 - 20(10%) = 180
    expect(totals.items[1].finalLineTotal).toBe(180);

    expect(totals.subtotal).toBe(265);
    expect(totals.grandTotal).toBe(265);
  });

  it('should cap line discounts at 0 so finalLineTotal is never negative', () => {
    const state = {
      items: [
        { id: '1', name: 'Item 1', unitPrice: 50, qty: 1, lineDiscount: { type: 'flat', value: 100 } },
      ],
      globalDiscount: { type: 'flat', value: 0 }
    };
    const totals = calculateBillTotals(state);
    expect(totals.items[0].finalLineTotal).toBe(0);
    expect(totals.subtotal).toBe(0);
  });

  it('should apply flat global discount and safeguard grand total rounding', () => {
    const state = {
      items: [
        { id: '1', name: 'Item 1', unitPrice: 100.5, qty: 1, lineDiscount: { type: 'flat', value: 0 } },
      ],
      globalDiscount: { type: 'flat', value: 10 }
    };
    // 100.5 -> 101. 101 - 10 = 91.
    const totals = calculateBillTotals(state);
    expect(totals.subtotal).toBe(101);
    expect(totals.globalDiscountAmt).toBe(10);
    expect(totals.grandTotal).toBe(91);
  });

  it('should apply percent global discount and cap grand total at 0', () => {
    const state = {
      items: [
        { id: '1', name: 'Item 1', unitPrice: 100, qty: 1, lineDiscount: { type: 'flat', value: 0 } },
      ],
      globalDiscount: { type: 'percent', value: 150 } // 150% discount
    };
    const totals = calculateBillTotals(state);
    expect(totals.subtotal).toBe(100);
    expect(totals.globalDiscountAmt).toBe(150);
    expect(totals.grandTotal).toBe(0); // Should be capped at 0, not -50
  });
});
