import { describe, it, expect } from 'vitest';
import { confirm, subscribeConfirm } from '../lib/confirm';

describe('confirm', () => {
  it('resolves false when no host is mounted', async () => {
    expect(await confirm('x')).toBe(false);
  });
  it('resolves with the host answer', async () => {
    const off = subscribeConfirm((r) => r.resolve(true));
    expect(await confirm({ message: 'x' })).toBe(true);
    off();
    expect(await confirm('x')).toBe(false);
  });
});
