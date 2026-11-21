import { describe, it, expect, beforeEach, vi } from 'vitest';
import { draftKey, saveDraft, loadDraft, clearDraft, isDraftEmpty, sameDay } from '../lib/productDraft';

const store = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  });
});

const form = (o = {}) => ({ name: 'Hells', price: '499', axes: [{ name: 'Size', values: '6, 7' }, { name: 'Colour', values: '' }], comboStock: { a: '3' }, ...o });

describe('productDraft', () => {
  it('is per shop and per user', () => {
    expect(draftKey('s1', 'u1')).not.toBe(draftKey('s1', 'u2'));
    expect(draftKey('s1', 'u1')).not.toBe(draftKey('s2', 'u1'));
    expect(draftKey('', 'u1')).toBeNull();
  });
  it('saves, restores and clears', () => {
    const k = draftKey('s', 'u');
    expect(saveDraft(k, form())).toBe(true);
    const d = loadDraft(k);
    expect(d.name).toBe('Hells');
    expect(d.comboStock).toEqual({ a: '3' });
    expect(d.axes[0].values).toBe('6, 7');
    clearDraft(k);
    expect(loadDraft(k)).toBeNull();
  });
  it('an empty form is never kept and removes an old draft', () => {
    const k = draftKey('s', 'u');
    saveDraft(k, form());
    expect(saveDraft(k, { name: '  ', price: '', axes: [{ name: 'Size', values: '' }], comboStock: {} })).toBe(false);
    expect(loadDraft(k)).toBeNull();
    expect(isDraftEmpty(null)).toBe(true);
  });
  it('skips a photo that is too big but keeps the text', () => {
    const k = draftKey('s', 'u');
    saveDraft(k, form({ photo: 'x'.repeat(200000) }));
    expect(loadDraft(k).photo).toBeNull();
    saveDraft(k, form({ photo: 'data:image/jpeg;base64,abc' }));
    expect(loadDraft(k).photo).toBe('data:image/jpeg;base64,abc');
  });
  it('survives broken or blocked storage', () => {
    const k = draftKey('s', 'u');
    store[k] = '{not json';
    expect(loadDraft(k)).toBeNull();
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } });
    expect(saveDraft(k, form())).toBe(false);
    expect(loadDraft(k)).toBeNull();
    expect(() => clearDraft(k)).not.toThrow();
  });
  it('knows whether a draft is from today', () => {
    const now = new Date(2026, 10, 22, 9);
    expect(sameDay(new Date(2026, 10, 22, 1).getTime(), now)).toBe(true);
    expect(sameDay(new Date(2026, 10, 21, 23).getTime(), now)).toBe(false);
  });
});
