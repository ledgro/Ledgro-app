import fs from 'fs';

let content = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Toaster, toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register'

// Stash cart to localStorage on preload error
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const lastReload = sessionStorage.getItem('ledgro-last-reload');
  if (lastReload && Date.now() - parseInt(lastReload) < 10000) {
    console.warn("Skipping reload loop");
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
    } catch(e) {}
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster position="top-center" />
  </StrictMode>,
)
`;

fs.writeFileSync('src/main.jsx', content);
