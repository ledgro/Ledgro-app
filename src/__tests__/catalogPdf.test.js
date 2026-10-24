import { describe, it, expect } from 'vitest';
import { groupCatalog } from '../lib/catalogPdf';

describe('groupCatalog', () => {
  it('folds variants into one product with price range and sizes', () => {
    const items = [
      { id: 'a', groupId: 'g', baseName: 'Heels', name: 'Heels - 6', options: { Size: '6' }, lastUsedPrice: 100000, stockCount: 2, hasImage: true, category: 'Ladies' },
      { id: 'b', groupId: 'g', baseName: 'Heels', name: 'Heels - 7', options: { Size: '7' }, lastUsedPrice: 120000, stockCount: 0, category: 'Ladies' },
      { id: 'c', name: 'Socks', lastUsedPrice: 5000, stockCount: 4, category: 'Ladies' },
    ];
    const out = groupCatalog(items);
    expect(out).toHaveLength(2);
    const h = out.find((p) => p.name === 'Heels');
    expect([h.min, h.max]).toEqual([100000, 120000]);
    expect(h.variants.map((v) => [v.label, v.out])).toEqual([['6', false], ['7', true]]);
    expect(h.img.id).toBe('a');
    expect(out.find((p) => p.name === 'Socks').stock).toBe(4);
  });
});
