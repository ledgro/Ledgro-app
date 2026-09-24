import { describe, it, expect } from 'vitest';
import {
  billReducer,
  initialBillState,
  calculateBillTotals,
} from './billReducer';

describe('billReducer', () => {
  it('should return default state for unknown action', () => {
    const state = billReducer(initialBillState, { type: 'UNKNOWN' });
    expect(state).toEqual(initialBillState);
  });

  it('should add a new item with a generated UUID', () => {
    const action = {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 2 },
    };
    const state = billReducer(initialBillState, action);

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({
      name: 'Apple',
      unitPrice: 10,
      qty: 2,
      lineDiscount: { type: 'flat', value: 0 },
      catalogId: null,
    });
    // Verify ID is a valid UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(state.items[0].id).toMatch(uuidRegex);
  });

  it('should increment quantity if exact item already exists', () => {
    const state1 = billReducer(initialBillState, {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 2 },
    });
    const state2 = billReducer(state1, {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 3 },
    });

    expect(state2.items).toHaveLength(1);
    expect(state2.items[0].qty).toBe(5);
  });

  it('should update item quantity', () => {
    const state1 = billReducer(initialBillState, {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 2 },
    });
    const itemId = state1.items[0].id;

    const state2 = billReducer(state1, {
      type: 'UPDATE_QTY',
      payload: { id: itemId, qty: 10 },
    });

    expect(state2.items[0].qty).toBe(10);
  });

  it('should remove item', () => {
    const state1 = billReducer(initialBillState, {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 2 },
    });
    const itemId = state1.items[0].id;

    const state2 = billReducer(state1, {
      type: 'REMOVE_ITEM',
      payload: { id: itemId },
    });

    expect(state2.items).toHaveLength(0);
  });

  it('should set line discount', () => {
    const state1 = billReducer(initialBillState, {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 2 },
    });
    const itemId = state1.items[0].id;

    const state2 = billReducer(state1, {
      type: 'SET_LINE_DISCOUNT',
      payload: { id: itemId, discount: { type: 'percent', value: 10 } },
    });

    expect(state2.items[0].lineDiscount).toEqual({ type: 'percent', value: 10 });
  });

  it('should set global discount', () => {
    const state = billReducer(initialBillState, {
      type: 'SET_GLOBAL_DISCOUNT',
      payload: { type: 'flat', value: 50 },
    });

    expect(state.globalDiscount).toEqual({ type: 'flat', value: 50 });
  });

  it('should clear bill', () => {
    const state1 = billReducer(initialBillState, {
      type: 'ADD_ITEM',
      payload: { name: 'Apple', unitPrice: 10, qty: 2 },
    });
    const state2 = billReducer(state1, { type: 'CLEAR_BILL' });

    expect(state2).toEqual(initialBillState);
  });

  describe('calculateBillTotals', () => {
    it('should calculate subtotals and grand totals correctly', () => {
      const state = {
        items: [
          {
            id: '1',
            name: 'Item 1',
            unitPrice: 100,
            qty: 2,
            lineDiscount: { type: 'percent', value: 10 },
          },
          {
            id: '2',
            name: 'Item 2',
            unitPrice: 50,
            qty: 1,
            lineDiscount: { type: 'flat', value: 5 },
          },
        ],
        globalDiscount: { type: 'flat', value: 20 },
      };

      const result = calculateBillTotals(state);

      // Item 1: rawTotal = 200, discount = 20, final = 180
      // Item 2: rawTotal = 50, discount = 5, final = 45
      // Subtotal = 180 + 45 = 225
      // Global discount = 20
      // Grand Total = 225 - 20 = 205
      expect(result.subtotal).toBe(225);
      expect(result.globalDiscountAmt).toBe(20);
      expect(result.grandTotal).toBe(205);
    });
  });
});
