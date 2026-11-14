import { App as CapApp } from '@capacitor/app';
import { toast } from 'sonner';
import { isNative } from './native';

// Where pressing Back leaves the app instead of going to a previous page.
const EXIT_PAGES = new Set(['/dashboard', '/login', '/setup']);
const OPEN_SHEET = '[role="dialog"][data-state="open"], [data-vaul-drawer][data-state="open"]';

/**
 * Android Back button, behaving like an app:
 * 1. a sheet or confirm box is open -> close it
 * 2. there is a page behind this one -> go back to it
 * 3. a deep page with nothing behind it -> go to Home
 * 4. on Home -> press Back twice to leave
 */
export function installNativeBack(router) {
  if (!isNative) return;
  let lastExitTap = 0;
  CapApp.addListener('backButton', () => {
    if (document.querySelector(OPEN_SHEET)) {
      // the sheets (vaul / radix) close on Escape, same as a tap outside
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      return;
    }
    const path = router.state.location.pathname;
    if (EXIT_PAGES.has(path)) {
      const now = Date.now();
      if (now - lastExitTap < 2000) { CapApp.exitApp(); return; }
      lastExitTap = now;
      toast('Press back again to exit');
      return;
    }
    const idx = window.history.state?.idx ?? 0;
    if (idx > 0) router.navigate(-1);
    else router.navigate('/dashboard', { replace: true });
  });
}
