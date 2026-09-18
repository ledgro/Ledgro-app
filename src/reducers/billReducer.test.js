import { describe, it, expect } from 'vitest';
import {
  billReducer,
  calculateBillTotals,
  initialBillState,
} from './billReducer';

describe('calculateBillTotals', () => {
  it('handles empty bill state', () => {
    const state = {
      items: [],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals).toEqual({
      items: [],
      subtotal: 0,
      globalDiscountAmt: 0,
      grandTotal: 0,
    });
  });

  it('calculates totals for standard items without discounts', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Item A',
          unitPrice: 50,
          qty: 2,
          lineDiscount: { type: 'flat', value: 0 },
        },
        {
          id: '2',
          name: 'Item B',
          unitPrice: 30,
          qty: 1,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.subtotal).toBe(130);
    expect(totals.globalDiscountAmt).toBe(0);
    expect(totals.grandTotal).toBe(130);
    expect(totals.items[0]).toMatchObject({
      rawTotal: 100,
      discountAmt: 0,
      finalLineTotal: 100,
    });
    expect(totals.items[1]).toMatchObject({
      rawTotal: 30,
      discountAmt: 0,
      finalLineTotal: 30,
    });
  });

  it('rounds raw item total to nearest whole rupee before applying line discount', () => {
    // 12.4 * 1.5 = 18.6 => roundedBaseTotal = 19
    const state = {
      items: [
        {
          id: '1',
          name: 'Loose Item',
          unitPrice: 12.4,
          qty: 1.5,
          lineDiscount: { type: 'percent', value: 10 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.items[0].rawTotal).toBe(19);
    // 10% of 19 is 1.9
    expect(totals.items[0].discountAmt).toBe(1.9);
    // 19 - 1.9 = 17.1
    expect(totals.items[0].finalLineTotal).toBe(17.1);
    expect(totals.subtotal).toBe(17.1);
    // Final safeguard rounding: Math.round(17.1) = 17
    expect(totals.grandTotal).toBe(17);
  });

  it('applies flat line discounts correctly', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Shirt',
          unitPrice: 500,
          qty: 1,
          lineDiscount: { type: 'flat', value: 50 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.items[0].discountAmt).toBe(50);
    expect(totals.items[0].finalLineTotal).toBe(450);
    expect(totals.subtotal).toBe(450);
    expect(totals.grandTotal).toBe(450);
  });

  it('applies percentage line discounts correctly', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Jacket',
          unitPrice: 1000,
          qty: 2,
          lineDiscount: { type: 'percent', value: 15 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    // rawTotal = 2000, 15% discount = 300
    expect(totals.items[0].rawTotal).toBe(2000);
    expect(totals.items[0].discountAmt).toBe(300);
    expect(totals.items[0].finalLineTotal).toBe(1700);
    expect(totals.subtotal).toBe(1700);
    expect(totals.grandTotal).toBe(1700);
  });

  it('caps line total at 0 if line discount exceeds item base total', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Promo Item',
          unitPrice: 20,
          qty: 1,
          lineDiscount: { type: 'flat', value: 50 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.items[0].finalLineTotal).toBe(0);
    expect(totals.subtotal).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });

  it('applies flat global discount correctly', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Book',
          unitPrice: 200,
          qty: 2,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'flat', value: 50 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.subtotal).toBe(400);
    expect(totals.globalDiscountAmt).toBe(50);
    expect(totals.grandTotal).toBe(350);
  });

  it('applies percentage global discount correctly', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Groceries',
          unitPrice: 500,
          qty: 1,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'percent', value: 10 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.subtotal).toBe(500);
    expect(totals.globalDiscountAmt).toBe(50);
    expect(totals.grandTotal).toBe(450);
  });

  it('caps grandTotal at 0 if global discount exceeds subtotal', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Snack',
          unitPrice: 100,
          qty: 1,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'flat', value: 150 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.subtotal).toBe(100);
    expect(totals.globalDiscountAmt).toBe(150);
    expect(totals.grandTotal).toBe(0);
  });

  it('applies safeguard rounding to grandTotal', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Item',
          unitPrice: 100,
          qty: 1,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'percent', value: 12.5 }, // 100 - 12.5 = 87.5 => rounds to 88
    };

    const totals = calculateBillTotals(state);

    expect(totals.subtotal).toBe(100);
    expect(totals.globalDiscountAmt).toBe(12.5);
    expect(totals.grandTotal).toBe(88);
  });
});

describe('billReducer', () => {
  it('adds a new item to bill', () => {
    const state = initialBillState;
    const action = {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 3, catalogId: 'cat_1' },
    };

    const newState = billReducer(state, action);

    expect(newState.items).toHaveLength(1);
    expect(newState.items[0]).toMatchObject({
      name: 'Apple',
      unitPrice: 10,
      qty: 3,
      catalogId: 'cat_1',
      lineDiscount: { type: 'flat', value: 0 },
    });
    expect(newState.items[0].id).toBeDefined();
  });

  it('increments quantity when adding an existing item with same name and unit price', () => {
    const state = {
      ...initialBillState,
      items: [
        {
          id: 'existing_1',
          name: 'Apple',
          unitPrice: 10,
          qty: 2,
          lineDiscount: { type: 'flat', value: 0 },
          catalogId: 'cat_1',
        },
      ],
    };
    const action = {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 3 },
    };

    const newState = billReducer(state, action);

    expect(newState.items).toHaveLength(1);
    expect(newState.items[0].qty).toBe(5);
  });

  it('updates quantity of an item by id', () => {
    const state = {
      ...initialBillState,
      items: [
        {
          id: 'item_1',
          name: 'Banana',
          unitPrice: 5,
          qty: 2,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
    };
    const action = {
      type: 'UPDATE_QTY',
      payload: { id: 'item_1', qty: 10 },
    };

    const newState = billReducer(state, action);

    expect(newState.items[0].qty).toBe(10);
  });

  it('removes an item by id', () => {
    const state = {
      ...initialBillState,
      items: [
        {
          id: 'item_1',
          name: 'Banana',
          unitPrice: 5,
          qty: 2,
        },
        {
          id: 'item_2',
          name: 'Orange',
          unitPrice: 8,
          qty: 1,
        },
      ],
    };
    const action = {
      type: 'REMOVE_ITEM',
      payload: { id: 'item_1' },
    };

    const newState = billReducer(state, action);

    expect(newState.items).toHaveLength(1);
    expect(newState.items[0].id).toBe('item_2');
  });

  it('sets line discount for a specific item', () => {
    const state = {
      ...initialBillState,
      items: [
        {
          id: 'item_1',
          name: 'Mango',
          unitPrice: 50,
          qty: 1,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
    };
    const action = {
      type: 'SET_LINE_DISCOUNT',
      payload: {
        id: 'item_1',
        discount: { type: 'percent', value: 10 },
      },
    };

    const newState = billReducer(state, action);

    expect(newState.items[0].lineDiscount).toEqual({
      type: 'percent',
      value: 10,
    });
  });

  it('sets global discount', () => {
    const state = initialBillState;
    const action = {
      type: 'SET_GLOBAL_DISCOUNT',
      payload: { type: 'flat', value: 100 },
    };

    const newState = billReducer(state, action);

    expect(newState.globalDiscount).toEqual({ type: 'flat', value: 100 });
  });

  it('clears bill back to initial state', () => {
    const state = {
      items: [
        {
          id: 'item_1',
          name: 'Pen',
          unitPrice: 10,
          qty: 5,
        },
      ],
      globalDiscount: { type: 'percent', value: 5 },
    };
    const action = { type: 'CLEAR_BILL' };

    const newState = billReducer(state, action);

    expect(newState).toEqual(initialBillState);
  });

  it('returns state unchanged for unknown action types', () => {
    const state = initialBillState;
    const action = { type: 'UNKNOWN_ACTION' };

    const newState = billReducer(state, action);

    expect(newState).toBe(state);
  });
});
