import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

// The Celestia content repository is far too large to copy into public/, so the
// dev server streams it straight from celestia-data/.
function serveCelestiaData(): Plugin {
  const prefix = '/celestia-data/';
  const root = fileURLToPath(new URL('./celestia-data', import.meta.url));

  return {
    name: 'serve-celestia-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(prefix)) return next();

        const relative = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
        const file = join(root, normalize(relative));
        if (!file.startsWith(root + sep)) return next();

        let stat;
        try {
          stat = statSync(file);
        } catch {
          return next();
        }
        if (!stat.isFile()) return next();

        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), serveCelestiaData()],
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
