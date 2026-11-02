import { describe, it, expect, beforeEach } from 'vitest';
import { loadHeld, saveHeld, addHeld, removeHeld, heldSummary, MAX_HELD, HELD_TTL_MS } from '../lib/heldBills';

const cart = (n = 1) => ({ items: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Shoe ${i}`, unitPriceAtSale: 50000, qty: 1, lineDiscount: { type: 'flat', value: 0 } })), globalDiscount: null });

describe('held bills', () => {
  beforeEach(() => localStorage.clear());
  it('holds newest first and removes by id', () => {
    const a = addHeld([], cart());
    const b = addHeld(a, cart(2), Date.now() + 1000);
    expect(b).toHaveLength(2);
    expect(b[0].items).toHaveLength(2);
    expect(removeHeld(b, b[0].id)).toHaveLength(1);
  });
  it('does not hold an empty cart and stops at the limit', () => {
    expect(addHeld([], { items: [] })).toBeNull();
    let list = [];
    for (let i = 0; i < MAX_HELD; i++) list = addHeld(list, cart());
    expect(addHeld(list, cart())).toBeNull();
  });
  it('is kept per user and shop and drops after 12 hours', () => {
    const list = addHeld([], cart(), 1000);
    saveHeld('u1', 's1', list);
    expect(loadHeld('u1', 's1', 2000)).toHaveLength(1);
    expect(loadHeld('u2', 's1', 2000)).toEqual([]);
    expect(loadHeld('u1', 's2', 2000)).toEqual([]);
    expect(loadHeld('u1', 's1', 1000 + HELD_TTL_MS + 1)).toEqual([]);
  });
  it('summarises total, count and names', () => {
    const s = heldSummary(addHeld([], cart(3))[0]);
    expect(s.total).toBe(150000);
    expect(s.count).toBe(3);
    expect(s.names).toBe('Shoe 0, Shoe 1');
  });
});
