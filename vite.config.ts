import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Adds a service worker that precaches the app shell (JS/CSS/fonts/icons)
    // so reopening the app — especially from the home-screen icon on iOS/
    // Android — loads instantly from the device instead of waiting on the
    // network, the same "feels instant" behavior other home-screen web apps
    // have. This only caches static assets, never Supabase data, so athletes
    // and the coach always see live data; `registerType: "autoUpdate"` means
    // a new deploy replaces the cached shell in the background on next visit,
    // no stale-version risk. Manifest already exists as a static file
    // (public/manifest.webmanifest, linked from index.html), so this only
    // adds the service worker on top of it rather than generating its own.
    VitePWA({
      manifest: false,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
})
