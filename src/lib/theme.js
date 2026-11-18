import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isNative } from './native';

const KEY = 'ledgro-theme';
const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function getThemePref() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' || v === 'auto' ? v : 'dark'; } catch { return 'dark'; }
}

export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'auto' && !!mq()?.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1220' : '#F8FAFC');
  // In the Android app the status/navigation bar icons follow the app theme, not the phone's.
  if (isNative) SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* storage blocked */ }
  applyTheme(pref);
}

/** Follow the phone's setting while the choice is Auto. */
export function watchSystemTheme() {
  const m = mq();
  if (!m) return;
  m.addEventListener('change', () => { if (getThemePref() === 'auto') applyTheme('auto'); });
}
