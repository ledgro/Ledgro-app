import fs from 'fs';

let content = fs.readFileSync('vite.config.js', 'utf-8');

const oldPWA = /VitePWA\(\{[\s\S]*?\}\)/;
const newPWA = `VitePWA({
      registerType: 'prompt', // prompt mode prevents forced auto-reload dropping active carts
      injectRegister: 'auto',
      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // Bump up cache limit for index bundle
        runtimeCaching: [
          {
            urlPattern: /^https:\\/\\/fonts\\.(?:googleapis|gstatic)\\.com\\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Ledgro POS',
        short_name: 'Ledgro',
        theme_color: '#F8FAFC',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
          // Note: In real life we'd add actual PNGs here for Chrome/iOS compatibility
        ]
      }
    })`;

content = content.replace(oldPWA, newPWA);
fs.writeFileSync('vite.config.js', content);
