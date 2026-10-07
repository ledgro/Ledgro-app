import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), getDocs: vi.fn(),
  writeBatch: vi.fn(), doc: vi.fn(), deleteDoc: vi.fn(), waitForPendingWrites: vi.fn(), where: vi.fn(),
}));

const { rs } = await import('../lib/reportExport');
const { signedBillTotal, isCashAdjustment } = await import('../lib/aggregations');

describe('report helpers', () => {
  it('formats paise as Rs with Indian grouping', () => {
    expect(rs(12345678)).toBe('Rs 1,23,456.78');
    expect(rs(-500)).toBe('-Rs 5.00');
    expect(rs('x')).toBe('Rs 0.00');
  });
});

describe('aggregations helpers', () => {
  it('returns are always negative, legacy or new', () => {
    expect(signedBillTotal({ type: 'return', grandTotal: -500 })).toBe(-500);
    expect(signedBillTotal({ type: 'return', grandTotal: 500 })).toBe(-500);
    expect(signedBillTotal({ grandTotal: 700 })).toBe(700);
  });
  it('detects cash adjustments, not real expenses', () => {
    expect(isCashAdjustment({ category: 'cash_adjustment' })).toBe(true);
    expect(isCashAdjustment({ category: 'other', description: 'Cash Shortage' })).toBe(true);
    expect(isCashAdjustment({ category: 'rent', description: 'Cash Shortage' })).toBe(false);
    expect(isCashAdjustment({ category: 'rent', description: 'Shop rent' })).toBe(false);
  });
});
