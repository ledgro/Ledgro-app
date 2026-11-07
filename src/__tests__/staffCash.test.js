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

import { periodSummary, loanStatus, groupByMonth, personId } from '../lib/staffCash';

describe('staff wages', () => {
  const at = (d, h = 12) => new Date(2026, 10, d, h);
  const base = [
    { id: 'l1', kind: 'advance', amount: 500000, createdAt: at(1) },
    { kind: 'work', units: 1, amount: 60000, createdAt: at(2) },
    { kind: 'work', units: 0.5, amount: 30000, createdAt: at(3) },
    { kind: 'payout', via: 'cash', amount: 40000, createdAt: at(3) },
    { kind: 'repay', via: 'salary', amount: 20000, createdAt: at(4) },
  ];
  it('sums days, earned, paid, cut and what is due', () => {
    const s = periodSummary(base);
    expect(s.days).toBe(1.5);
    expect(s.earned).toBe(90000);
    expect(s.paid).toBe(40000);
    expect(s.cut).toBe(20000);
    expect(s.due).toBe(30000);
    expect(s.owed).toBe(480000);
  });
  it('starts a new period after a settle up', () => {
    const closed = [...base, { kind: 'close', amount: 90000, createdAt: at(5) }, { kind: 'work', units: 1, amount: 60000, createdAt: at(6) }];
    const s = periodSummary(closed);
    expect(s.days).toBe(1);
    expect(s.earned).toBe(60000);
    expect(s.due).toBe(60000);
  });
  it('a loan written off with waive stops counting as owed', () => {
    const e = [...base, { kind: 'repay', via: 'waive', amount: 480000, createdAt: at(7) }];
    expect(periodSummary(e).owed).toBe(0);
    expect(loanStatus(e).get('l1').closed).toBe(true);
  });
  it('clears loans oldest first', () => {
    const e = [
      { id: 'a', kind: 'debt', amount: 1000, createdAt: at(1) },
      { id: 'b', kind: 'debt', amount: 1000, createdAt: at(2) },
      { kind: 'repay', via: 'cash', amount: 1500, createdAt: at(3) },
    ];
    const s = loanStatus(e);
    expect(s.get('a').closed).toBe(true);
    expect(s.get('b').left).toBe(500);
  });
  it('cash wages leave the drawer, UPI and salary cuts do not', () => {
    expect(staffCashNet([{ kind: 'payout', via: 'cash', amount: 500 }, { kind: 'payout', via: 'upi', amount: 700 }, { kind: 'repay', via: 'waive', amount: 100 }])).toBe(500);
  });
  it('groups newest first by month', () => {
    const g = groupByMonth([{ createdAt: new Date(2026, 9, 2) }, { createdAt: new Date(2026, 10, 3) }, { createdAt: new Date(2026, 10, 4) }]);
    expect(g).toHaveLength(2);
    expect(g[0].items).toHaveLength(2);
  });
  it('makes a safe id from a name', () => {
    expect(personId('  Ramesh  K. ')).toBe('ramesh-k');
    expect(personId('!!!')).toBe('staff');
  });
});
