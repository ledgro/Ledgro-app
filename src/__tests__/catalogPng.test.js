import { describe, it, expect } from 'vitest';
import { cardLayout, fitFont, wrapTwoLines, safeFileName, planImages, visibleSizes, defaultImageOptions, CARD_H, CARD_W } from '../lib/catalogPng';

const card = (n, out = 0) => ({ name: 'Hells', min: 100, max: 100, img: null, variants: Array.from({ length: n }, (_, i) => ({ label: `S${i}`, qty: i < out ? 0 : 3, out: i < out })) });
const measure = (t, fs) => t.length * fs * 0.5;

describe('cardLayout', () => {
  it('fits 1 to 20 sizes, with and without stock', () => {
    for (const stock of [false, true]) for (let n = 0; n <= 20; n++) {
      const L = cardLayout(card(n), { ...defaultImageOptions, stock });
      expect(L.fits).toBe(true);
      expect(L.photo.h).toBeGreaterThanOrEqual(240);
      L.chips.forEach((c) => { expect(c.x + c.w).toBeLessThanOrEqual(CARD_W); expect(c.y + c.h).toBeLessThanOrEqual(CARD_H); });
    }
  });
  it('chips never overlap each other', () => {
    const L = cardLayout(card(12), { ...defaultImageOptions });
    L.chips.forEach((a, i) => L.chips.forEach((b, j) => {
      if (i < j) expect(a.x + a.w <= b.x + 0.1 || b.x + b.w <= a.x + 0.1 || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }));
  });
  it('hide sold-out removes those sizes only', () => {
    const o = { ...defaultImageOptions, hideSoldOut: true };
    expect(visibleSizes(card(5, 2), o)).toHaveLength(3);
    expect(visibleSizes(card(5, 2), { ...o, hideSoldOut: false })).toHaveLength(5);
    expect(visibleSizes(card(5, 2), { ...o, sizes: false })).toHaveLength(0);
  });
});

describe('text fitting', () => {
  it('shrinks until the label fits, but not below the minimum', () => {
    expect(fitFont(measure, 'UK 8', 200, 40)).toBeLessThanOrEqual(40);
    expect(measure('6-7 yrs XL', fitFont(measure, '6-7 yrs XL', 100, 40))).toBeLessThanOrEqual(100);
    expect(fitFont(measure, 'x'.repeat(200), 10, 40, 16)).toBe(16);
  });
  it('wraps to two lines and cuts with dots', () => {
    const lines = wrapTwoLines(measure, 'Block Heel Sandal With Ankle Strap In Dark Brown Leather Premium Edition', 300, 20);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('...')).toBe(true);
    expect(wrapTwoLines(measure, 'Hells', 300, 20)).toEqual(['Hells']);
  });
});

describe('file names and plan', () => {
  it('sanitises and keeps names unique', () => {
    const taken = new Set();
    expect(safeFileName('Hells - Dark Brown / 40%', 'png', taken)).toBe('Hells-Dark-Brown-40.png');
    expect(safeFileName('Hells - Dark Brown / 40%', 'png', taken)).toBe('Hells-Dark-Brown-40-2.png');
    expect(safeFileName('', 'png')).toBe('product.png');
  });
  it('counts products skipped for having no photo', () => {
    const items = [
      { id: 'a', name: 'A', lastUsedPrice: 100, hasImage: true },
      { id: 'b', name: 'B', lastUsedPrice: 100 },
    ];
    expect(planImages(items, { skipNoPhoto: true })).toMatchObject({ skipped: 1 });
    expect(planImages(items, { skipNoPhoto: true }).cards).toHaveLength(1);
    expect(planImages(items, { skipNoPhoto: false }).cards).toHaveLength(2);
  });
});
