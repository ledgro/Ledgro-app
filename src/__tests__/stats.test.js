import { describe, it, expect } from 'vitest';
import { billDelta, expenseDelta, negate, addInto, emptyStats, buildDayStats, sumStats, dayKey } from '../lib/statsMath';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
const sale = (id, total, method = 'cash', extra = {}) => ({ id, type: 'sale', grandTotal: total, paymentMethod: method, payment: { method }, createdAt: at(2026, 1, 2), ...extra });

describe('billDelta', () => {
  it('cash sale', () => {
    const d = billDelta(sale('a', 10000));
    expect(d).toMatchObject({ rev: 10000, cash: 10000, upi: 0, bills: 1 });
  });
  it('upi sale', () => {
    expect(billDelta(sale('a', 5000, 'upi'))).toMatchObject({ rev: 5000, upi: 5000, cash: 0 });
  });
  it('split sale goes to the split buckets', () => {
    const b = sale('a', 10000, 'split', { payment: { method: 'split', breakdown: { cash: 6000, upi: 4000 } } });
    expect(billDelta(b)).toMatchObject({ rev: 10000, splitCash: 6000, splitUpi: 4000, cash: 0, upi: 0 });
  });
  it('return is negative and does not count as a bill', () => {
    const d = billDelta({ id: 'r', type: 'return', grandTotal: -3000, paymentMethod: 'cash' });
    expect(d).toMatchObject({ rev: -3000, cash: -3000, bills: 0 });
  });
  it('a refund by upi comes out of upi', () => {
    expect(billDelta({ id: 'r', type: 'return', grandTotal: -3000, paymentMethod: 'upi', refundMethod: 'upi' }).upi).toBe(-3000);
  });
  it('reversed bill adds nothing', () => {
    expect(billDelta({ id: 'a', type: 'reversal', grandTotal: 10000 })).toEqual(emptyStats());
  });
});

describe('expenseDelta', () => {
  it('cash expense reduces expected cash', () => {
    expect(expenseDelta({ amount: 2000, category: 'tea', paidVia: 'cash' })).toMatchObject({ exp: 2000, expCash: 2000, cats: { tea: 2000 } });
  });
  it('upi expense does not touch cash', () => {
    expect(expenseDelta({ amount: 2000, category: 'rent', paidVia: 'upi' })).toMatchObject({ exp: 2000, expCash: 0 });
  });
  it('old cash shortage adjustments are ignored', () => {
    expect(expenseDelta({ amount: 500, category: 'cash_adjustment' })).toEqual(emptyStats());
  });
  it('category names are made safe for field names', () => {
    expect(Object.keys(expenseDelta({ amount: 1, category: 'a.b/c' }).cats)).toEqual(['a_b_c']);
  });
});

describe('voiding', () => {
  it('adding a bill then its negation leaves the day exactly as it was', () => {
    const day = emptyStats();
    const b = sale('a', 12345, 'split', { payment: { method: 'split', breakdown: { cash: 12000, upi: 345 } } });
    addInto(day, billDelta(b));
    addInto(day, negate(billDelta(b)));
    expect(day).toEqual(emptyStats());
  });
});

describe('buildDayStats (rebuild)', () => {
  const bills = [
    sale('s1', 10000),
    sale('s2', 4000, 'upi'),
    sale('s3', 7000, 'cash', { type: 'reversal', originalBillId: 's3' }),
    { id: 'r1', type: 'return', grandTotal: -1000, paymentMethod: 'cash', originalBillId: 's1', createdAt: at(2026, 1, 2) },
    { id: 'r2', type: 'return', grandTotal: -500, paymentMethod: 'cash', originalBillId: 's3', createdAt: at(2026, 1, 2) },
    sale('s4', 2000, 'cash', { createdAt: at(2026, 1, 3) }),
  ];
  const expenses = [
    { id: 'e1', amount: 1500, category: 'tea', paidVia: 'cash', createdAt: at(2026, 1, 2) },
    { id: 'e2', amount: 300, category: 'cash_adjustment', createdAt: at(2026, 1, 2) },
  ];
  const days = buildDayStats(bills, expenses);

  it('groups by day', () => {
    expect([...days.keys()].sort()).toEqual(['2026-01-02', '2026-01-03']);
  });
  it('excludes voided sales and returns made against voided sales', () => {
    const d = days.get('2026-01-02');
    expect(d.rev).toBe(10000 + 4000 - 1000);
    expect(d.bills).toBe(2);
    expect(d.cash).toBe(10000 - 1000);
    expect(d.upi).toBe(4000);
  });
  it('counts real expenses but not cash adjustments', () => {
    const d = days.get('2026-01-02');
    expect(d.exp).toBe(1500);
    expect(d.expCash).toBe(1500);
  });
  it('sumStats adds days together', () => {
    const t = sumStats([...days.values()]);
    expect(t.rev).toBe(13000 + 2000);
    expect(t.exp).toBe(1500);
  });
  it('dayKey is yyyy-MM-dd', () => {
    expect(dayKey(at(2026, 1, 2))).toBe('2026-01-02');
  });
});
