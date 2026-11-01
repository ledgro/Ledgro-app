import { describe, it, expect } from 'vitest';
import { exchangeTotals, replacementItems, netStockDeltas, flooredStockChange } from '../lib/exchange';
import { formatBillNo, fiscalYear, reserveBillNo } from '../lib/billNumber';

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
  it('is a GST serial: financial year plus a six digit count, 16 characters at most', () => {
    expect(formatBillNo(new Date('2026-11-02T10:00:00Z'), 123)).toBe('26-27/000123');
    expect(formatBillNo(new Date('2026-11-02T10:00:00Z'), 45, 'R')).toBe('R/26-27/000045');
    expect(formatBillNo(new Date('2026-11-02T10:00:00Z'), 999999, 'R').length).toBeLessThanOrEqual(16);
  });
  it('the financial year turns over on 1 April, India time', () => {
    expect(fiscalYear(new Date('2027-03-31T18:00:00Z')).label).toBe('26-27'); // 31 Mar 23:30 IST
    expect(fiscalYear(new Date('2027-03-31T18:30:00Z')).label).toBe('27-28'); // 1 Apr 00:00 IST
    expect(fiscalYear(new Date('2027-01-15T00:00:00Z')).label).toBe('26-27');
  });
  it('takes the next number from the shop counter and starts at 1', async () => {
    const d = new Date('2026-11-02T10:00:00Z');
    const doc = (_db, path, id) => ({ path: `${path}/${id}` });
    const first = await reserveBillNo({ doc, db: {}, shopId: 's', date: d, read: async () => ({ exists: () => false }) });
    expect(first.billNo).toBe('26-27/000001');
    expect(first.data).toEqual({ last: 1 });
    expect(first.ref.path).toBe('shops/s/billCounters/2627');
    const next = await reserveBillNo({ doc, db: {}, shopId: 's', date: d, read: async () => ({ exists: () => true, data: () => ({ last: 41 }) }) });
    expect(next.billNo).toBe('26-27/000042');
    const credit = await reserveBillNo({ doc, db: {}, shopId: 's', date: d, kind: 'R', read: async () => ({ exists: () => false }) });
    expect(credit.ref.path).toBe('shops/s/billCounters/2627-R');
  });
});
