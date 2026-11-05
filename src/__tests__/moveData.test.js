import { describe, it, expect } from 'vitest';
import { buildProductsExport, parseProductsExport, planImport, toPayload, itemKey } from '../lib/moveData';

const slide = (id, size, extra = {}) => ({ id, groupId: 'g1', baseName: 'Nike Slides', options: { Size: size }, name: `Nike Slides - ${size}`, lastUsedPrice: 50000, stockCount: 4, costPrice: 30000, category: 'Slides', isActive: true, ...extra });

describe('move products', () => {
  it('exports without stock or cost unless asked', () => {
    const a = buildProductsExport([slide('a', '6')]);
    expect(a.items[0]).not.toHaveProperty('stock');
    expect(a.items[0]).not.toHaveProperty('cost');
    const b = buildProductsExport([slide('a', '6')], { stock: true, cost: true });
    expect(b.items[0].stock).toBe(4);
    expect(b.items[0].cost).toBe(30000);
  });
  it('skips inactive and deleted products', () => {
    expect(buildProductsExport([slide('a', '6', { isActive: false }), slide('b', '7', { deleted: true })]).count).toBe(0);
  });
  it('round trips and cleans', () => {
    const file = JSON.stringify(buildProductsExport([slide('a', '6'), slide('b', '7')], { stock: true }));
    const { items } = parseProductsExport(file);
    expect(items).toHaveLength(2);
    expect(items[0].options).toEqual({ Size: '6' });
    expect(items[0].stock).toBe(4);
  });
  it('rejects other files and bad rows', () => {
    expect(parseProductsExport('nope').error).toBeTruthy();
    expect(parseProductsExport('{"app":"x","items":[]}').error).toBeTruthy();
    const { items } = parseProductsExport(JSON.stringify({ app: 'ledgro-products', items: [{ name: '', price: 1 }, { name: 'A', price: -5 }, { name: 'B', price: 100 }] }));
    expect(items.map((i) => i.name)).toEqual(['B']);
  });
  it('matches existing products by name and size, ignoring case', () => {
    const incoming = parseProductsExport(JSON.stringify(buildProductsExport([slide('a', '6'), slide('b', '7')]))).items;
    const plan = planImport([slide('x', '6', { baseName: 'nike slides' })], incoming);
    expect(plan.dupes).toHaveLength(1);
    expect(plan.fresh).toHaveLength(1);
    expect(itemKey(plan.fresh[0])).toContain('size=7');
  });
  it('gives new group ids and never sends undefined', () => {
    const [it] = parseProductsExport(JSON.stringify(buildProductsExport([slide('a', '6')]))).items;
    const p = toPayload(it, { groupFor: () => 'NEW', uid: 'u1', serverTimestamp: () => 'ts' });
    expect(p.groupId).toBe('NEW');
    expect(Object.values(p).includes(undefined)).toBe(false);
    expect(p.createdBy).toBe('u1');
  });
});
