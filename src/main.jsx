import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Toaster, toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register'
import { installErrorOverlay } from './lib/errorOverlay'

// Stash cart to localStorage on preload error
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const lastReload = sessionStorage.getItem('ledgro-last-reload');
  if (lastReload && Date.now() - parseInt(lastReload) < 10000) {
    console.warn("Reload loop detected: resetting service worker and caches once");
    if (!sessionStorage.getItem('ledgro-sw-reset')) {
      sessionStorage.setItem('ledgro-sw-reset', '1');
      const done = () => window.location.reload();
      Promise.all([
        navigator.serviceWorker?.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))),
        window.caches?.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))),
      ]).then(done, done);
    }
    return;
  }

  // Save current cart state before reload
  const cartState = window.__LEDGRO_CART_STATE__;
  const uid = window.__LEDGRO_UID__;
  const shopId = window.__LEDGRO_SHOPID__;
  if (cartState && cartState.items?.length > 0) {
    try {
      localStorage.setItem('ledgro-cart-recovery', JSON.stringify({
        cartState,
        uid,
        shopId,
        savedAt: new Date().toISOString()
      }));
    } catch { /* storage full or blocked */ }
  }

  sessionStorage.setItem('ledgro-last-reload', Date.now().toString());

  // Defer reload — don't interrupt if checkout is in progress
  const isCheckingOut = window.__LEDGRO_CHECKOUT_ACTIVE__;
  if (!isCheckingOut) {
    window.location.reload();
  } else {
    // Wait for checkout to complete then reload, or fallback timeout
    window.addEventListener('ledgro:checkout-complete', () => {
      window.location.reload();
    }, { once: true });
    setTimeout(() => { window.location.reload(); }, 30000); // 30s fallback
  }
});

// Force PWA cache auto-reload
const updateSW = registerSW({
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      // Check for updates every 60 minutes
      setInterval(() => {
        if (navigator.onLine) {
           registration.update().catch(err => console.warn(err));
        }
      }, 60 * 60 * 1000);

      // Also check when coming back from background
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
           registration.update().catch(err => console.warn(err));
        }
      });
    }
  },
  onNeedRefresh() {
    // Wait until checkout finishes before prompting
    if (window.__LEDGRO_CHECKOUT_ACTIVE__ || (window.__LEDGRO_CART_STATE__ && window.__LEDGRO_CART_STATE__.items?.length > 0)) {
       toast.info("Update available. Finish your sale, then tap here to refresh.", {
          duration: Infinity,
          onDismiss: () => updateSW(true),
          onClick: () => updateSW(true),
          action: { label: 'Refresh', onClick: () => updateSW(true) }
       });

       window.addEventListener('ledgro:checkout-complete', () => {
          updateSW(true);
       }, { once: true });
    } else {
       updateSW(true); // If we are not mid-checkout, just update immediately
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

// ---- Startup safety net -------------------------------------------------------------
// A blank white page is the worst failure: nobody can tell what is wrong. If the app
// cannot start (missing build setting, stale cache, broken script) show the reason and
// a one-tap reset instead.
let lastStartupError = '';
window.addEventListener('error', (e) => { lastStartupError = e.message || String(e.error || ''); });
window.addEventListener('unhandledrejection', (e) => { lastStartupError = String(e.reason?.message || e.reason || ''); });

function showFatal(message) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'alert');
  wrap.style.cssText = 'min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font-family:system-ui,sans-serif;background:#F8FAFC;color:#0F172A';
  const h = document.createElement('h1');
  h.textContent = 'Ledgro could not start';
  h.style.cssText = 'font-size:24px;font-weight:800;margin:0';
  const p = document.createElement('p');
  p.textContent = message;
  p.style.cssText = 'font-size:14px;line-height:1.5;max-width:420px;margin:0;color:#475569;word-break:break-word';
  const btn = document.createElement('button');
  btn.textContent = 'Clear cache and reload';
  btn.style.cssText = 'height:48px;padding:0 24px;border:0;border-radius:12px;background:#2563EB;color:#fff;font-size:16px;font-weight:700';
  btn.onclick = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs || []).map((r) => r.unregister()));
      const keys = await window.caches?.keys();
      await Promise.all((keys || []).map((k) => caches.delete(k)));
    } catch { /* ignore */ }
    window.location.reload();
  };
  wrap.append(h, p, btn);
  root.append(wrap);
}

async function start() {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    showFatal('This build has no Firebase key. Set VITE_FIREBASE_API_KEY in the hosting build settings, then redeploy.');
    return;
  }
  try {
    const { default: App } = await import('./App.jsx');
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
        <Toaster position="top-center" />
      </StrictMode>,
    );
    installErrorOverlay();
    // If nothing painted after 8s, say so instead of leaving a white screen.
    setTimeout(() => {
      const root = document.getElementById('root');
      if (root && root.childElementCount === 0) showFatal(lastStartupError || 'The app did not load. Clearing the cache usually fixes this.');
    }, 8000);
  } catch (err) {
    console.error('Startup failed:', err);
    showFatal(String(err?.message || err));
  }
}

start();
