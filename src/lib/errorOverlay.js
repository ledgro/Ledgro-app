import { toast } from 'sonner';

// Errors nobody caught used to vanish into the browser console, leaving a screen that
// looks empty or frozen. Show them on screen instead, in plain words plus the raw code.
const recent = new Map();

function explain(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || 'Unknown error');
  if (code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
    return 'The database refused this request (permission-denied). The security rules may not match this screen.';
  }
  if (code === 'failed-precondition' && /index/i.test(msg)) {
    return 'The database needs an index for this screen (failed-precondition). Deploy firestore.indexes.json.';
  }
  if (code === 'unavailable' || /network|offline/i.test(msg)) {
    return 'Cannot reach the server. Check your internet connection.';
  }
  return (code ? `${code}: ` : '') + msg;
}

function report(err) {
  const text = explain(err).slice(0, 220);
  const now = Date.now();
  if (recent.get(text) && now - recent.get(text) < 10000) return;
  recent.set(text, now);
  toast.error('Something failed', { description: text, duration: 9000 });
}

export function installErrorOverlay() {
  window.addEventListener('unhandledrejection', (e) => report(e.reason));
  window.addEventListener('error', (e) => {
    if (/ResizeObserver loop/i.test(e.message || '')) return;
    if (!e.error && !e.message) return;
    report(e.error || e.message);
  });
}
