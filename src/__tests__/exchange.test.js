import { describe, it, expect, beforeEach } from 'vitest';
import { exchangeTotals, replacementItems, netStockDeltas, flooredStockChange } from '../lib/exchange';
import { generateBillNumber } from '../lib/billNumber';

const lines = [{ catalogId: 'a', name: 'Shoe', unitPrice: 50000, qty: 2 }, { catalogId: 'b', name: 'Sock', unitPrice: 2000, qty: 1 }];

describe('exchange math', () => {
  it('totals and difference', () => {
    expect(exchangeTotals(90000, lines)).toEqual({ newTotal: 102000, difference: 12000 });
    expect(exchangeTotals(120000, lines).difference).toBe(-18000);
  });
  it('replacement items carry line totals', () => {
    const items = replacementItems(lines);
    expect(items[0]).toMatchObject({ rawTotal: 100000, finalLineTotal: 100000, unit: 'unit' });
  });
  it('nets stock per item', () => {
    const d = netStockDeltas([{ catalogId: 'a', qty: 2 }, { catalogId: 'c', qty: 1 }], lines);
    expect(d.get('a')).toBe(0);
    expect(d.get('b')).toBe(-1);
    expect(d.get('c')).toBe(1);
  });
  it('never takes stock below zero', () => {
    expect(flooredStockChange(3, -5)).toBe(-3);
    expect(flooredStockChange(0, -2)).toBe(0);
    expect(flooredStockChange(null, -2)).toBe(0);
    expect(flooredStockChange(4, 2)).toBe(2);
  });
});

describe('bill number', () => {
  beforeEach(() => localStorage.clear());
  it('is short and counts up per day', () => {
    const a = generateBillNumber();
    const b = generateBillNumber();
    expect(a).toMatch(/^\d{4}-[0-9A-Z]{2}-01$/);
    expect(b.endsWith('-02')).toBe(true);
    expect(a.slice(0, 7)).toBe(b.slice(0, 7));
  });
});
