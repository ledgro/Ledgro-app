import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../lib/idb', () => ({ clearStore: vi.fn(), getAllRecords: vi.fn(), putRecords: vi.fn() }));

const { encodeItem, decodeItem, mergeChanged, newestCursor, needsFullRead, FULL_REFRESH_MS } = await import('../lib/catalogSync');

describe('catalog sync helpers', () => {
  it('timestamps survive encode then decode', () => {
    const item = { id: 'a', name: 'Rice', updatedAt: new Timestamp(100, 5), createdAt: new Timestamp(50, 0) };
    const back = decodeItem(JSON.parse(JSON.stringify(encodeItem(item))));
    expect(back.updatedAt).toBeInstanceOf(Timestamp);
    expect(back.updatedAt.seconds).toBe(100);
    expect(back.updatedAt.nanoseconds).toBe(5);
    expect(back.name).toBe('Rice');
  });

  it('merge replaces changed products and adds new ones', () => {
    const merged = mergeChanged([{ id: 'a', stockCount: 1 }, { id: 'b', stockCount: 2 }], [{ id: 'b', stockCount: 9 }, { id: 'c', stockCount: 3 }]);
    expect(merged.find((i) => i.id === 'a').stockCount).toBe(1);
    expect(merged.find((i) => i.id === 'b').stockCount).toBe(9);
    expect(merged.find((i) => i.id === 'c').stockCount).toBe(3);
    expect(merged).toHaveLength(3);
  });

  it('cursor is the newest updatedAt, never going backwards', () => {
    const items = [{ updatedAt: new Timestamp(10, 0) }, { updatedAt: new Timestamp(30, 7) }, { updatedAt: new Timestamp(30, 2) }, {}];
    expect(newestCursor(items, null)).toEqual({ seconds: 30, nanoseconds: 7 });
    expect(newestCursor([{ updatedAt: new Timestamp(5, 0) }], { seconds: 99, nanoseconds: 0 })).toEqual({ seconds: 99, nanoseconds: 0 });
    expect(newestCursor([], null)).toBe(null);
  });

  it('full read on first visit, other shop, missing cursor or after a day', () => {
    const now = 10 * FULL_REFRESH_MS;
    const meta = { shopId: 's1', cursor: { seconds: 1, nanoseconds: 0 }, fullAt: now - 1000 };
    expect(needsFullRead(null, 's1', now)).toBe(true);
    expect(needsFullRead(meta, 's2', now)).toBe(true);
    expect(needsFullRead({ ...meta, cursor: null }, 's1', now)).toBe(true);
    expect(needsFullRead({ ...meta, fullAt: now - FULL_REFRESH_MS - 1 }, 's1', now)).toBe(true);
    expect(needsFullRead(meta, 's1', now)).toBe(false);
  });
});
