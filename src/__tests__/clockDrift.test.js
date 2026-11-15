import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('serverNow in the Android app', () => {
  beforeEach(() => { vi.resetModules(); });
  it('reads the Date header through the native HTTP layer, not the local app server', async () => {
    const get = vi.fn().mockResolvedValue({ headers: { date: 'Sun, 15 Nov 2026 08:00:00 GMT' } });
    vi.doMock('@capacitor/core', () => ({ CapacitorHttp: { get }, Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('../lib/native', () => ({ isNative: true }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { serverNow } = await import('../lib/clockDrift');
    const d = await serverNow();
    expect(get).toHaveBeenCalled();
    expect(get.mock.calls[0][0].url).toMatch(/^https:\/\/ledgro-app\.pages\.dev\/__\/time/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Math.abs(d.getTime() - Date.parse('Sun, 15 Nov 2026 08:00:00 GMT'))).toBeLessThan(5000);
  });
  it('throws (saves nothing) when the header is missing', async () => {
    vi.doMock('@capacitor/core', () => ({ CapacitorHttp: { get: vi.fn().mockResolvedValue({ headers: {} }) }, Capacitor: { isNativePlatform: () => true } }));
    vi.doMock('../lib/native', () => ({ isNative: true }));
    const { serverNow } = await import('../lib/clockDrift');
    await expect(serverNow()).rejects.toThrow('CLOCK');
  });
});
