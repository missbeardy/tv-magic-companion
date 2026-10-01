// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { devGeocodeApiPlugin } from './scripts/devGeocodeApiPlugin.js'
import { devPlatformSimulateApiPlugin } from './scripts/devPlatformSimulateApiPlugin.js'

export default defineConfig({
  plugins: [
    devGeocodeApiPlugin(),
    devPlatformSimulateApiPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
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
      // dd6: this used to duplicate public/manifest.json verbatim, generating a second,
      // unreferenced manifest.webmanifest that only drifted from the one index.html actually
      // links. public/manifest.json is the single source of truth — `manifest: false` stops
      // the plugin emitting its own (omitting the key isn't enough; it still writes a default
      // empty one).
      manifest: false,
      devOptions: {
        enabled: true,
      },
    }),
  ],
})