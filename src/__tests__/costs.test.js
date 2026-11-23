import { describe, it, expect } from 'vitest';
import { costFields, withCosts, planCostMove } from '../lib/costs';

const items = [
  { id: 'a', name: 'A', costPrice: 5000, source: 'Ravi' },
  { id: 'b', name: 'B', costPrice: null, source: '' },
  { id: 'c', name: 'C', costPrice: 7000, source: '' },
  { id: 'd', name: 'D', costPrice: null, source: 'Kochi' },
  { id: 'e', name: 'E', costPrice: 100, deleted: true },
];

describe('costFields', () => {
  it('reads the new document first', () => {
    expect(costFields(items[0], { a: { costPrice: 6000, source: 'New' } })).toEqual({ costPrice: 6000, source: 'New' });
  });
  it('an emptied new document wins over the old field', () => {
    expect(costFields(items[0], { a: { costPrice: null, source: '' } })).toEqual({ costPrice: null, source: '' });
  });
  it('falls back to the old fields for products not moved yet', () => {
    expect(costFields(items[0], {})).toEqual({ costPrice: 5000, source: 'Ravi' });
    expect(costFields(items[1], undefined)).toEqual({ costPrice: null, source: '' });
  });
  it('withCosts maps every item', () => {
    expect(withCosts(items.slice(0, 2), { b: { costPrice: 9, source: 'x' } }).map((i) => i.costPrice)).toEqual([5000, 9]);
  });
});

describe('planCostMove', () => {
  it('moves only products that have old data and no cost document', () => {
    expect(planCostMove(items, {}).map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });
  it('is safe to run twice: moved products are skipped', () => {
    expect(planCostMove(items, { a: {}, c: {} }).map((r) => r.id)).toEqual(['d']);
    expect(planCostMove(items, { a: {}, c: {}, d: {} })).toEqual([]);
  });
});
