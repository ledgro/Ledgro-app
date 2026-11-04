import { describe, it, expect } from 'vitest';
import { summarize, rankItems, busyTimes, returnsByProduct, deadStock } from '../lib/reports';

const at = (iso) => new Date(iso);
const sale = (id, total, items, when = '2026-11-02T10:00:00') => ({ id, type: 'sale', grandTotal: total, items, createdAt: at(when) });
const catalog = [
  { id: 'a', name: 'Sandal - 38 / Black', baseName: 'Sandal', options: { Size: '38', Colour: 'Black' }, stockCount: 4, lastUsedPrice: 50000 },
  { id: 'b', name: 'Sandal - 39 / Brown', baseName: 'Sandal', options: { Size: '39', Colour: 'brown' }, stockCount: 3, lastUsedPrice: 50000 },
  { id: 'c', name: 'Loafer', stockCount: 2, lastUsedPrice: 90000 },
  { id: 'd', name: 'Slipper', stockCount: 0, lastUsedPrice: 20000 },
];
const bills = [
  sale('1', 100000, [{ catalogId: 'a', name: 'Sandal - 38 / Black', qty: 2, finalLineTotal: 100000 }]),
  sale('2', 50000, [{ catalogId: 'b', name: 'Sandal - 39 / Brown', qty: 1, finalLineTotal: 50000 }], '2026-11-03T18:30:00'),
  { id: '3', type: 'return', grandTotal: -50000, items: [{ name: 'Sandal - 39 / Brown', qty: 1, lineTotal: 50000 }], createdAt: at('2026-11-04T11:00:00') },
  { id: '4', type: 'reversal', grandTotal: 99999, items: [], createdAt: at('2026-11-04T12:00:00') },
];

describe('reports', () => {
  it('summarises only live sales and counts returns separately', () => {
    const s = summarize(bills);
    expect(s.bills).toBe(2);
    expect(s.revenue).toBe(150000);
    expect(s.avgBill).toBe(75000);
    expect(s.unitsPerBill).toBe(1.5);
    expect(s.returned).toBe(50000);
    expect(s.returnRate).toBeCloseTo(1 / 3);
  });
  it('ranks by product, colour and size', () => {
    expect(rankItems(bills, catalog, 'product')[0]).toMatchObject({ label: 'Sandal', qty: 3, revenue: 150000 });
    const colours = rankItems(bills, catalog, 'colour');
    expect(colours.map((c) => c.label)).toEqual(['Black', 'Brown']);
    expect(rankItems(bills, catalog, 'size').map((c) => c.label)).toEqual(['38', '39']);
  });
  it('falls back to the line name when the product is not in the catalog', () => {
    const rows = rankItems([sale('9', 100, [{ catalogId: 'zzz', name: 'Boot - 40', qty: 1, finalLineTotal: 100 }])], [], 'product');
    expect(rows[0].label).toBe('Boot');
  });
  it('counts busy days and hours', () => {
    const t = busyTimes(bills);
    expect(t.weekday.reduce((a, d) => a + d.bills, 0)).toBe(2);
    expect(t.hour[10].bills).toBe(1);
    expect(t.hour[18].bills).toBe(1);
  });
  it('lists returned products with their return rate', () => {
    const r = returnsByProduct(bills);
    expect(r[0]).toMatchObject({ label: 'Sandal', qty: 1, sold: 3 });
    expect(r[0].rate).toBeCloseTo(1 / 3);
  });
  it('finds stock that did not sell, biggest value first, ignoring untracked and empty stock', () => {
    const dead = deadStock(catalog, bills);
    expect(dead.map((d) => d.id)).toEqual(['c']);
    expect(dead[0].value).toBe(180000);
  });
});
