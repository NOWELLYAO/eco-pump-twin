import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Application installable et utilisable hors ligne (PWA)
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['logo.png', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'apple-touch-icon-152.png', 'apple-touch-icon-167.png'],
      manifest: {
        name: 'ECO PUMP AFRIK — Configurateur d\'installation',
        short_name: 'EcoPump',
        description: 'Conception, simulation et diagnostic d\'installations de pompes, utilisable hors ligne.',
        lang: 'fr',
        start_url: '/#design',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#eef2f6',
        theme_color: '#1689c6',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Photos déjà consultées : disponibles ensuite hors ligne
            urlPattern: /^https:\/\/upload\.wikimedia\.org\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'photos', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/commons\.wikimedia\.org\/w\/api\.php.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'photos-index', networkTimeoutSeconds: 4, expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
})
