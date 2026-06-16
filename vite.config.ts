// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Tell the plugin NOT to generate sw.js — we'll use our own
      // because OneSignal needs to co-exist
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      // These files will be precached (available offline)
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['OneSignalSDKWorker.js'],
      },
      manifest: {
        name: 'TVMagic Companion',
        short_name: 'TVMagic',
        description: 'Field service CRM for TVMagic technicians',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#004B93',
        orientation: 'portrait',
        icons: [
          {
            src: '/tvmagic-logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/tvmagic-logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})