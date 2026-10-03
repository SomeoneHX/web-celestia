import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  // Emscripten emits the glue as a separate ESM file loaded at runtime, so it
  // must not be pre-bundled by esbuild.
  optimizeDeps: {
    exclude: ['@/wasm/celestia_astro.js'],
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
