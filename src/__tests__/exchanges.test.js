import { describe, it, expect } from 'vitest';
import { foldExchanges } from '../lib/exchanges';

const t = (m) => new Date(2026, 10, 1, 10, m);
describe('foldExchanges', () => {
  it('pairs by exchangeId', () => {
    const out = foldExchanges([
      { id: 's', type: 'sale', exchangeId: 'x1', exchangeOf: 'o', createdAt: t(1), grandTotal: 500 },
      { id: 'r', type: 'return', exchangeId: 'x1', exchangeOf: 'o', createdAt: t(1), grandTotal: -440 },
    ]);
    expect(out.find((b) => b.id === 's').exchangeReturn.id).toBe('r');
    expect(out.find((b) => b.id === 'r').folded).toBe(true);
  });
  it('a bill exchanged twice (old data, same exchangeOf) pairs each sale with its own return', () => {
    const out = foldExchanges([
      { id: 's1', type: 'sale', exchangeOf: 'o', createdAt: t(1) }, { id: 'r1', type: 'return', exchangeOf: 'o', createdAt: t(1), grandTotal: -100 },
      { id: 's2', type: 'sale', exchangeOf: 'o', createdAt: t(30) }, { id: 'r2', type: 'return', exchangeOf: 'o', createdAt: t(30), grandTotal: -200 },
    ]);
    expect(out.find((b) => b.id === 's1').exchangeReturn.id).toBe('r1');
    expect(out.find((b) => b.id === 's2').exchangeReturn.id).toBe('r2');
  });
  it('a plain return stays visible and a sale without its return is left alone', () => {
    const out = foldExchanges([{ id: 'r', type: 'return', createdAt: t(1) }, { id: 's', type: 'sale', exchangeId: 'x', createdAt: t(2) }]);
    expect(out.find((b) => b.id === 'r').folded).toBe(false);
    expect(out.find((b) => b.id === 's').exchangeReturn).toBeUndefined();
  });
});
