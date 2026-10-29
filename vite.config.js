import { defineConfig } from 'vite';

// SCENTÁLA is a single-page cinematic storefront: one HTML entry, all assets procedural.
export default defineConfig({
  server: { host: '127.0.0.1', port: 5190, strictPort: true, hmr: false },
  preview: { host: '127.0.0.1', port: 5191 },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
  },
});
