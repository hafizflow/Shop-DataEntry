import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.HTTPS ? [basicSsl()] : []), // `npm run dev:https`: self-signed cert so a phone on the same Wi-Fi gets the camera
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Shop Product Entry',
        short_name: 'Product Entry',
        description: 'Scan barcodes and add shop products fast.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#15803d',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + the self-hosted ZXing WASM, so scanning works offline. Supabase calls are never cached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
