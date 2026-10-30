import { describe, it, expect } from 'vitest';
import { staffCashNet, staffBalances } from '../lib/staffCash';

describe('staff cash', () => {
  const e = (kind, amount, extra = {}) => ({ staff: 'Ravi', kind, amount, ...extra });
  it('drawer: advances and debts go out, cash repayments come back, salary repayments never touch it', () => {
    expect(staffCashNet([e('advance', 50000), e('debt', 20000), e('repay', 10000, { via: 'cash' }), e('repay', 30000, { via: 'salary' })])).toBe(60000);
  });
  it('balances per person, case-insensitive, largest first', () => {
    const out = staffBalances([e('advance', 50000), { staff: 'ravi ', kind: 'repay', amount: 20000, via: 'salary' }, { staff: 'Anu', kind: 'debt', amount: 90000 }]);
    expect(out.map((p) => [p.name, p.owed])).toEqual([['Anu', 90000], ['Ravi', 30000]]);
  });
  it('counts what was taken this month', () => {
    const ms = new Date(2026, 9, 1);
    const out = staffBalances([e('advance', 1000, { createdAt: new Date(2026, 8, 20) }), e('debt', 2000, { createdAt: new Date(2026, 9, 5) })], ms);
    expect(out[0].thisMonth).toBe(2000);
  });
});
