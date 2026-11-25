import { describe, it, expect, vi, beforeEach } from 'vitest';

let listener;
const exitApp = vi.fn();
vi.mock('@capacitor/app', () => ({ App: { addListener: (_e, fn) => { listener = fn; }, exitApp: (...a) => exitApp(...a) } }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('../lib/native', () => ({ isNative: true }));

const { installNativeBack, backStack } = await import('../lib/nativeBack');
const router = { state: { location: { pathname: '/products' } }, navigate: vi.fn() };

beforeEach(() => { backStack.length = 0; router.navigate.mockReset(); document.body.innerHTML = ''; installNativeBack(router); });

describe('hardware Back', () => {
  it('select mode gets Back first, the page does not move', () => {
    const exit = vi.fn(); backStack.push(exit);
    window.history.replaceState({ idx: 2 }, '');
    listener();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('an open sheet closes first and select mode stays', () => {
    const exit = vi.fn(); backStack.push(exit);
    document.body.innerHTML = '<div data-vaul-drawer data-state="open"></div>';
    const esc = vi.fn(); document.addEventListener('keydown', esc);
    listener();
    expect(esc).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    document.removeEventListener('keydown', esc);
  });
  it('the newest handler wins', () => {
    const a = vi.fn(); const b = vi.fn(); backStack.push(a, b);
    listener();
    expect(b).toHaveBeenCalled(); expect(a).not.toHaveBeenCalled();
  });
  it('with nothing registered it goes back a page', () => {
    window.history.replaceState({ idx: 2 }, '');
    listener();
    expect(router.navigate).toHaveBeenCalledWith(-1);
  });
});
