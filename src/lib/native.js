import { Capacitor } from '@capacitor/core';

/** True inside the Android app (Capacitor), false in the browser / PWA. */
export const isNative = Capacitor.isNativePlatform();

// In the app the system bars sit outside the page (the web layout was built for a browser, where they do).
if (isNative) {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1.0');
}
