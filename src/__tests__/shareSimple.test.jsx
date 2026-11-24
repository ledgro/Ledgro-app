import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { loadImagePrefs, saveImagePrefs, describePrefs, toRenderOptions, DEFAULT_IMAGE_PREFS } from '../lib/imagePrefs';
import { sendAction, skippedNote, toggleKey, selectAllKeys, pickedEntries } from '../lib/shareSelection';
import { useLongPress } from '../hooks/useLongPress';

const store = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } });
});
afterEach(() => { vi.useRealTimers(); });

describe('picture options', () => {
  it('start as price and sizes on, stock off', () => {
    expect(loadImagePrefs()).toEqual(DEFAULT_IMAGE_PREFS);
    expect(describePrefs(DEFAULT_IMAGE_PREFS)).toBe('Price and sizes shown');
  });
  it('are remembered on this device', () => {
    saveImagePrefs({ prices: false, sizes: true, stock: true });
    expect(loadImagePrefs()).toEqual({ prices: false, sizes: true, stock: true });
    expect(describePrefs({ prices: false, sizes: true, stock: true })).toBe('Sizes and stock numbers shown');
  });
  it('fall back to defaults when storage is blocked or broken', () => {
    store['ledgro.imagePrefs'] = '{oops';
    expect(loadImagePrefs()).toEqual(DEFAULT_IMAGE_PREFS);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } });
    expect(loadImagePrefs()).toEqual(DEFAULT_IMAGE_PREFS);
    expect(() => saveImagePrefs(DEFAULT_IMAGE_PREFS)).not.toThrow();
  });
  it('always hide sold-out sizes and skip products without a photo', () => {
    expect(toRenderOptions({ prices: true, sizes: true, stock: false })).toMatchObject({ hideSoldOut: true, skipNoPhoto: true, photos: true });
    expect(describePrefs({ prices: false, sizes: false, stock: false })).toBe('Name and photo only');
  });
});

describe('send button', () => {
  it('shares up to 30, becomes a ZIP above 30, and is disabled only at 0', () => {
    expect(sendAction(0).disabled).toBe(true);
    expect(sendAction(1)).toMatchObject({ label: 'Send 1 picture', mode: 'share', disabled: false });
    expect(sendAction(30)).toMatchObject({ label: 'Send 30 pictures', mode: 'share' });
    expect(sendAction(45)).toMatchObject({ label: 'Save 45 pictures as ZIP', mode: 'zip', disabled: false });
  });
  it('says how many have no photo', () => {
    expect(skippedNote(0)).toBe('');
    expect(skippedNote(1)).toBe('1 has no photo and is left out');
    expect(skippedNote(3)).toBe('3 have no photo and are left out');
  });
});

describe('selection', () => {
  const keyOf = (e) => e.key;
  const entries = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  it('a tap toggles a card on and off', () => {
    const on = toggleKey(new Set(), 'a');
    expect([...on]).toEqual(['a']);
    expect([...toggleKey(on, 'a')]).toEqual([]);
  });
  it('select all follows the current list (search and filter), not the whole catalog', () => {
    expect([...selectAllKeys(entries.slice(0, 2), keyOf)]).toEqual(['a', 'b']);
  });
  it('picks hidden by a later search are ignored', () => {
    const picked = new Set(['a', 'c']);
    expect(pickedEntries([{ key: 'a' }], picked, keyOf)).toHaveLength(1);
  });
});

describe('long press', () => {
  const Probe = ({ onLong, onTap }) => {
    const lp = useLongPress(onLong);
    return <button data-testid="card" {...lp} onClick={onTap}>card</button>;
  };
  it('holding for about half a second starts select mode and the release is not a tap', () => {
    vi.useFakeTimers();
    const onLong = vi.fn(); const onTap = vi.fn();
    const { getByTestId } = render(<Probe onLong={onLong} onTap={onTap} />);
    const el = getByTestId('card');
    fireEvent.pointerDown(el, { clientX: 5, clientY: 5, button: 0 });
    act(() => { vi.advanceTimersByTime(460); });
    fireEvent.pointerUp(el);
    fireEvent.click(el);
    expect(onLong).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });
  it('a quick tap is a normal tap', () => {
    vi.useFakeTimers();
    const onLong = vi.fn(); const onTap = vi.fn();
    const { getByTestId } = render(<Probe onLong={onLong} onTap={onTap} />);
    const el = getByTestId('card');
    fireEvent.pointerDown(el, { clientX: 5, clientY: 5, button: 0 });
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.pointerUp(el);
    fireEvent.click(el);
    act(() => { vi.advanceTimersByTime(800); });
    expect(onLong).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });
  it('scrolling (moving more than 10 px) cancels it', () => {
    vi.useFakeTimers();
    const onLong = vi.fn();
    const { getByTestId } = render(<Probe onLong={onLong} onTap={() => {}} />);
    const el = getByTestId('card');
    fireEvent.pointerDown(el, { clientX: 5, clientY: 5, button: 0 });
    fireEvent.pointerMove(el, { clientX: 5, clientY: 40 });
    act(() => { vi.advanceTimersByTime(800); });
    expect(onLong).not.toHaveBeenCalled();
  });
});
