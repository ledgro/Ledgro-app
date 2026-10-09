import { describe, it, expect } from 'vitest';
import { bizDayKey, bizDate, bizDayStart, buildDayStats } from '../lib/statsMath';

describe('business day cutoff 04:30', () => {
  it('01:00 belongs to previous day', () => expect(bizDayKey(new Date(2026, 0, 2, 1, 0))).toBe('2026-01-01'));
  it('04:29 previous day, 04:30 new day', () => {
    expect(bizDayKey(new Date(2026, 0, 2, 4, 29))).toBe('2026-01-01');
    expect(bizDayKey(new Date(2026, 0, 2, 4, 30))).toBe('2026-01-02');
  });
  it('23:59 same day', () => expect(bizDayKey(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01'));
  it('bizDayStart is 04:30 local', () => {
    const s = bizDayStart(new Date(2026, 0, 2));
    expect([s.getDate(), s.getHours(), s.getMinutes()]).toEqual([2, 4, 30]);
  });
  it('bizDate calendar day = business day', () => {
    const d = bizDate(new Date(2026, 0, 2, 2, 0));
    expect([d.getMonth(), d.getDate()]).toEqual([0, 1]);
  });
  it('buildDayStats groups late-night bill into previous day', () => {
    const m = buildDayStats([{ type: 'sale', grandTotal: 100, paymentMode: 'cash', createdAt: new Date(2026, 0, 2, 1, 0) }], []);
    expect(m.has('2026-01-01')).toBe(true);
    expect(m.has('2026-01-02')).toBe(false);
  });
});
