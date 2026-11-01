import { describe, it, expect } from 'vitest';
import { billReducer, initialBillState, calculateBillTotals } from '../reducers/billReducer';

const add = (state, extra = {}) => billReducer(state, { type: 'ADD_ITEM', payload: { name: 'Shoe', unitPriceAtSale: 38000, catalogId: 'c1', qty: 1, unit: 'piece', ...extra } });

describe('changing a price on the bill keeps the original', () => {
  it('remembers the catalog price the first time and does not overwrite it', () => {
    let s = add(initialBillState);
    const id = s.items[0].id;
    s = billReducer(s, { type: 'UPDATE_PRICE', payload: { id, price: 30000 } });
    expect(s.items[0].unitPriceAtSale).toBe(30000);
    expect(s.items[0].listPrice).toBe(38000);
    s = billReducer(s, { type: 'UPDATE_PRICE', payload: { id, price: 25000 } });
    expect(s.items[0].listPrice).toBe(38000);
  });
  it('works for a line loaded from a saved bill (stored as unitPrice)', () => {
    let s = billReducer(initialBillState, { type: 'INIT_FROM_EDIT', payload: { items: [{ name: 'Shoe', unitPrice: 38000, qty: 1 }] } });
    s = billReducer(s, { type: 'UPDATE_PRICE', payload: { id: s.items[0].id, price: 35000 } });
    expect(s.items[0].listPrice).toBe(38000);
  });
  it('survives remove + undo and reaches the totals', () => {
    let s = add(initialBillState);
    s = billReducer(s, { type: 'UPDATE_PRICE', payload: { id: s.items[0].id, price: 30000 } });
    const removed = s.items[0];
    s = billReducer(s, { type: 'REMOVE_ITEM', payload: { id: removed.id } });
    s = billReducer(s, { type: 'ADD_ITEM', payload: removed });
    expect(s.items[0].listPrice).toBe(38000);
    expect(s.items[0].unitPriceAtSale).toBe(30000);
    const t = calculateBillTotals(s);
    expect(t.items[0].listPrice).toBe(38000);
    expect(t.grandTotal).toBe(30000);
  });
  it('a line that was never changed has no listPrice', () => {
    expect(add(initialBillState).items[0].listPrice).toBeUndefined();
  });
  it('rejects a negative or non-numeric price', () => {
    const s = add(initialBillState);
    expect(billReducer(s, { type: 'UPDATE_PRICE', payload: { id: s.items[0].id, price: -1 } })).toBe(s);
    expect(billReducer(s, { type: 'UPDATE_PRICE', payload: { id: s.items[0].id, price: 'abc' } })).toBe(s);
  });
});
