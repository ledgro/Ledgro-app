import { describe, it, expect } from 'vitest';
import {
  billReducer,
  initialBillState,
  calculateBillTotals,
} from './billReducer';

describe('billReducer', () => {
  describe('ADD_ITEM', () => {
    it('adds a new item to an empty state with default quantity of 1 and flat discount of 0', () => {
      const action = {
        type: 'ADD_ITEM',
        payload: {
          name: 'Apple',
          unitPrice: 10,
          catalogId: 'cat_1',
        },
      };

      const newState = billReducer(initialBillState, action);

      expect(newState.items).toHaveLength(1);
      expect(newState.items[0]).toEqual({
        id: expect.any(String),
        name: 'Apple',
        unitPrice: 10,
        qty: 1,
        lineDiscount: { type: 'flat', value: 0 },
        catalogId: 'cat_1',
      });
    });

    it('adds a new item with specified quantity and null catalogId when catalogId is omitted', () => {
      const action = {
        type: 'ADD_ITEM',
        payload: {
          name: 'Banana',
          unitPrice: 5,
          qty: 3,
        },
      };

      const newState = billReducer(initialBillState, action);

      expect(newState.items).toHaveLength(1);
      expect(newState.items[0].qty).toBe(3);
      expect(newState.items[0].catalogId).toBeNull();
    });

    it('increments quantity when adding an existing item with identical name AND unitPrice', () => {
      const stateWithItem = {
        ...initialBillState,
        items: [
          {
            id: 'item_1',
            name: 'Milk',
            unitPrice: 25,
            qty: 2,
            lineDiscount: { type: 'flat', value: 0 },
            catalogId: 'cat_milk',
          },
        ],
      };

      const action = {
        type: 'ADD_ITEM',
        payload: {
          name: 'Milk',
          unitPrice: 25,
          qty: 3,
        },
      };

      const newState = billReducer(stateWithItem, action);

      expect(newState.items).toHaveLength(1);
      expect(newState.items[0].qty).toBe(5);
      expect(newState.items[0].id).toBe('item_1');
    });

    it('increments quantity by default 1 when qty is not provided in payload for matching item', () => {
      const stateWithItem = {
        ...initialBillState,
        items: [
          {
            id: 'item_1',
            name: 'Milk',
            unitPrice: 25,
            qty: 2,
            lineDiscount: { type: 'flat', value: 0 },
            catalogId: 'cat_milk',
          },
        ],
      };

      const action = {
        type: 'ADD_ITEM',
        payload: {
          name: 'Milk',
          unitPrice: 25,
        },
      };

      const newState = billReducer(stateWithItem, action);

      expect(newState.items).toHaveLength(1);
      expect(newState.items[0].qty).toBe(3);
    });

    it('adds as a separate item if name matches but unitPrice is different', () => {
      const stateWithItem = {
        ...initialBillState,
        items: [
          {
            id: 'item_1',
            name: 'Rice',
            unitPrice: 50,
            qty: 1,
            lineDiscount: { type: 'flat', value: 0 },
            catalogId: 'cat_rice',
          },
        ],
      };

      const action = {
        type: 'ADD_ITEM',
        payload: {
          name: 'Rice',
          unitPrice: 60,
          qty: 2,
        },
      };

      const newState = billReducer(stateWithItem, action);

      expect(newState.items).toHaveLength(2);
      expect(newState.items[0].unitPrice).toBe(50);
      expect(newState.items[1].unitPrice).toBe(60);
    });
  });

  describe('UPDATE_QTY', () => {
    it('updates quantity of specified item ID', () => {
      const stateWithItems = {
        ...initialBillState,
        items: [
          { id: 'item_1', name: 'Item 1', unitPrice: 10, qty: 1 },
          { id: 'item_2', name: 'Item 2', unitPrice: 20, qty: 2 },
        ],
      };

      const action = {
        type: 'UPDATE_QTY',
        payload: { id: 'item_1', qty: 10 },
      };

      const newState = billReducer(stateWithItems, action);

      expect(newState.items[0].qty).toBe(10);
      expect(newState.items[1].qty).toBe(2);
    });

    it('returns items unchanged if item ID is not found', () => {
      const stateWithItems = {
        ...initialBillState,
        items: [{ id: 'item_1', name: 'Item 1', unitPrice: 10, qty: 1 }],
      };

      const action = {
        type: 'UPDATE_QTY',
        payload: { id: 'non_existent_id', qty: 5 },
      };

      const newState = billReducer(stateWithItems, action);

      expect(newState.items[0].qty).toBe(1);
    });
  });

  describe('REMOVE_ITEM', () => {
    it('removes item with specified ID', () => {
      const stateWithItems = {
        ...initialBillState,
        items: [
          { id: 'item_1', name: 'Item 1', unitPrice: 10, qty: 1 },
          { id: 'item_2', name: 'Item 2', unitPrice: 20, qty: 2 },
        ],
      };

      const action = {
        type: 'REMOVE_ITEM',
        payload: { id: 'item_1' },
      };

      const newState = billReducer(stateWithItems, action);

      expect(newState.items).toHaveLength(1);
      expect(newState.items[0].id).toBe('item_2');
    });

    it('does nothing if item ID is not found', () => {
      const stateWithItems = {
        ...initialBillState,
        items: [{ id: 'item_1', name: 'Item 1', unitPrice: 10, qty: 1 }],
      };

      const action = {
        type: 'REMOVE_ITEM',
        payload: { id: 'non_existent_id' },
      };

      const newState = billReducer(stateWithItems, action);

      expect(newState.items).toHaveLength(1);
    });
  });

  describe('SET_LINE_DISCOUNT', () => {
    it('sets line discount for the target item', () => {
      const stateWithItems = {
        ...initialBillState,
        items: [
          {
            id: 'item_1',
            name: 'Item 1',
            unitPrice: 100,
            qty: 1,
            lineDiscount: { type: 'flat', value: 0 },
          },
        ],
      };

      const discountPayload = { type: 'percent', value: 10 };
      const action = {
        type: 'SET_LINE_DISCOUNT',
        payload: { id: 'item_1', discount: discountPayload },
      };

      const newState = billReducer(stateWithItems, action);

      expect(newState.items[0].lineDiscount).toEqual(discountPayload);
    });
  });

  describe('SET_GLOBAL_DISCOUNT', () => {
    it('sets global discount for the bill', () => {
      const discountPayload = { type: 'flat', value: 50 };
      const action = {
        type: 'SET_GLOBAL_DISCOUNT',
        payload: discountPayload,
      };

      const newState = billReducer(initialBillState, action);

      expect(newState.globalDiscount).toEqual(discountPayload);
    });
  });

  describe('CLEAR_BILL', () => {
    it('resets the bill state to initial state', () => {
      const modifiedState = {
        items: [{ id: 'item_1', name: 'Item 1', unitPrice: 100, qty: 5 }],
        globalDiscount: { type: 'percent', value: 20 },
      };

      const action = { type: 'CLEAR_BILL' };

      const newState = billReducer(modifiedState, action);

      expect(newState).toEqual(initialBillState);
    });
  });

  describe('DEFAULT / UNKNOWN ACTION', () => {
    it('returns current state when action type is unhandled', () => {
      const state = {
        items: [{ id: 'item_1', name: 'Item 1', unitPrice: 10, qty: 1 }],
        globalDiscount: { type: 'flat', value: 5 },
      };

      const action = { type: 'UNKNOWN_ACTION_TYPE' };

      const newState = billReducer(state, action);

      expect(newState).toBe(state);
    });
  });
});

describe('calculateBillTotals', () => {
  it('handles empty state correctly', () => {
    const totals = calculateBillTotals(initialBillState);

    expect(totals).toEqual({
      items: [],
      subtotal: 0,
      globalDiscountAmt: 0,
      grandTotal: 0,
    });
  });

  it('calculates totals correctly with no discounts', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Item A',
          unitPrice: 100,
          qty: 2,
          lineDiscount: { type: 'flat', value: 0 },
        },
        {
          id: '2',
          name: 'Item B',
          unitPrice: 50,
          qty: 3,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.subtotal).toBe(350); // (100*2) + (50*3) = 200 + 150
    expect(totals.globalDiscountAmt).toBe(0);
    expect(totals.grandTotal).toBe(350);
    expect(totals.items[0].finalLineTotal).toBe(200);
    expect(totals.items[1].finalLineTotal).toBe(150);
  });

  it('rounds raw item totals to nearest whole rupee BEFORE applying line discount', () => {
    // 12.4 * 3 = 37.2 -> rounded to 37 base total.
    // Line discount flat: 5 -> finalLineTotal: 32.
    const state = {
      items: [
        {
          id: '1',
          name: 'Loose Item',
          unitPrice: 12.4,
          qty: 3,
          lineDiscount: { type: 'flat', value: 5 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.items[0].rawTotal).toBe(37); // Math.round(37.2)
    expect(totals.items[0].discountAmt).toBe(5);
    expect(totals.items[0].finalLineTotal).toBe(32);
    expect(totals.subtotal).toBe(32);
    expect(totals.grandTotal).toBe(32);
  });

  it('calculates percentage line discount accurately', () => {
    // Base total = 200. 15% discount = 30. Final line total = 170.
    const state = {
      items: [
        {
          id: '1',
          name: 'Item',
          unitPrice: 100,
          qty: 2,
          lineDiscount: { type: 'percent', value: 15 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.items[0].discountAmt).toBe(30);
    expect(totals.items[0].finalLineTotal).toBe(170);
    expect(totals.subtotal).toBe(170);
  });

  it('prevents line total from becoming negative if line discount exceeds base total', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Cheap Item',
          unitPrice: 10,
          qty: 1,
          lineDiscount: { type: 'flat', value: 50 },
        },
      ],
      globalDiscount: { type: 'flat', value: 0 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.items[0].finalLineTotal).toBe(0);
    expect(totals.subtotal).toBe(0);
  });

  it('calculates flat and percentage global discounts correctly', () => {
    // Subtotal = 1000. 10% global discount = 100. Grand total = 900.
    const stateWithPercentGlobal = {
      items: [
        {
          id: '1',
          name: 'Item',
          unitPrice: 500,
          qty: 2,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'percent', value: 10 },
    };

    const totalsPercent = calculateBillTotals(stateWithPercentGlobal);
    expect(totalsPercent.subtotal).toBe(1000);
    expect(totalsPercent.globalDiscountAmt).toBe(100);
    expect(totalsPercent.grandTotal).toBe(900);

    // Flat global discount of 150 on subtotal 1000 -> grandTotal = 850.
    const stateWithFlatGlobal = {
      ...stateWithPercentGlobal,
      globalDiscount: { type: 'flat', value: 150 },
    };

    const totalsFlat = calculateBillTotals(stateWithFlatGlobal);
    expect(totalsFlat.globalDiscountAmt).toBe(150);
    expect(totalsFlat.grandTotal).toBe(850);
  });

  it('prevents grand total from becoming negative if global discount exceeds subtotal', () => {
    const state = {
      items: [
        {
          id: '1',
          name: 'Item',
          unitPrice: 50,
          qty: 1,
          lineDiscount: { type: 'flat', value: 0 },
        },
      ],
      globalDiscount: { type: 'flat', value: 100 },
    };

    const totals = calculateBillTotals(state);

    expect(totals.subtotal).toBe(50);
    expect(totals.globalDiscountAmt).toBe(100);
    expect(totals.grandTotal).toBe(0);
  });
});
