import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), getDocs: vi.fn(),
  writeBatch: vi.fn(), doc: vi.fn(), deleteDoc: vi.fn(), waitForPendingWrites: vi.fn(), where: vi.fn(),
}));

const { csvCell, paiseToRupeesStr, csvNumber } = await import('../lib/csv');
const { signedBillTotal, isCashAdjustment } = await import('../lib/aggregations');

describe('csv', () => {
  it('neutralises formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('@a')).toBe(`"'@a"`);
  });
  it('escapes quotes and nulls', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(null)).toBe('""');
  });
  it('paise -> rupees', () => {
    expect(paiseToRupeesStr(12345)).toBe('123.45');
    expect(paiseToRupeesStr(-500)).toBe('-5.00');
    expect(csvNumber('x')).toBe('0');
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
