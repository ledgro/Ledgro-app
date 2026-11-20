import { describe, it, expect } from 'vitest';
import { isPending } from '../lib/expenses';

describe('isPending', () => {
  it('unpaid and staff are pending', () => {
    expect(isPending({ paidVia: 'unpaid' })).toBe(true);
    expect(isPending({ paidVia: 'staff' })).toBe(true);
  });
  it('cash, upi, missing are not', () => {
    expect(isPending({ paidVia: 'cash' })).toBe(false);
    expect(isPending({ paidVia: 'upi' })).toBe(false);
    expect(isPending({})).toBe(false);
    expect(isPending(undefined)).toBe(false);
  });
});
