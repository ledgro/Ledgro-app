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

import { monthSummary, groupByMonth, personId } from '../lib/staffCash';

describe('staff ledger month view', () => {
  const at = (y, m, d) => new Date(y, m, d, 12);
  const monthStart = new Date(2026, 10, 1);
  const entries = [
    { kind: 'advance', amount: 500000, monthly: 200000, createdAt: at(2026, 9, 20) },
    { kind: 'repay', via: 'salary', amount: 200000, createdAt: at(2026, 10, 2) },
    { kind: 'repay', via: 'cash', amount: 50000, createdAt: at(2026, 10, 3) },
    { kind: 'repay', via: 'salary', amount: 100000, createdAt: at(2026, 9, 2) },
  ];
  it('cuts only this month\'s salary deductions from the pay', () => {
    const s = monthSummary(entries, 1500000, monthStart);
    expect(s.cut).toBe(200000);
    expect(s.pay).toBe(1300000);
  });
  it('balance owed counts every repayment, planned deduction never exceeds it', () => {
    const s = monthSummary(entries, 1500000, monthStart);
    expect(s.owed).toBe(150000);
    expect(s.planned).toBe(150000);
  });
  it('pay never goes below zero', () => {
    expect(monthSummary([{ kind: 'repay', via: 'salary', amount: 900000, createdAt: at(2026, 10, 5) }], 500000, monthStart).pay).toBe(0);
  });
  it('groups newest first by month', () => {
    const g = groupByMonth(entries);
    expect(g).toHaveLength(2);
    expect(g[0].items).toHaveLength(2);
  });
  it('makes a safe id from a name', () => {
    expect(personId('  Ramesh  K. ')).toBe('ramesh-k');
    expect(personId('!!!')).toBe('staff');
  });
});
