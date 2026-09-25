import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Toaster } from 'sonner';
import { registerSW } from 'virtual:pwa-register'

// Force PWA cache auto-reload
const updateSW = registerSW({
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      // Check for updates every 60 minutes
      setInterval(() => {
        registration.update()
      }, 60 * 60 * 1000)
    }
  },
  onNeedRefresh() {
    // A new service worker has installed and is waiting to activate.
    // Since we set skipWaiting: true in vite.config.js, it will activate immediately.
    // We just need to force the DOM to reload so it loads the new assets.
    window.location.reload(true)
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
