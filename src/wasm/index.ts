// Loads the WebAssembly astronomy core.
//
// The module is the single implementation of the time system conversions and of
// the VSOP87 solar ephemeris; the TypeScript side calls into it rather than
// duplicating the algorithms. `loadAstro()` is awaited once during startup, so
// every later call site can use the synchronous `astro` accessor.

import createCelestiaAstro, { type CelestiaAstroModule } from './celestia_astro.js';
// The emitted .wasm carries a content hash, so its URL is resolved by the bundler
// rather than guessed from the glue file's location.
import wasmUrl from './celestia_astro.wasm?url';

let instance: CelestiaAstroModule | null = null;
let pending: Promise<CelestiaAstroModule> | null = null;

export function loadAstro(onProgress?: (fraction: number, label: string) => void): Promise<CelestiaAstroModule> {
  if (instance) return Promise.resolve(instance);
  if (pending) return pending;

  onProgress?.(0.05, 'Compiling astronomy core');

  pending = createCelestiaAstro({
    locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
    printErr: (text: string) => console.error('[wasm]', text),
  }).then((mod) => {
    instance = mod;
    onProgress?.(0.2, 'Astronomy core ready');
    return mod;
  });

  return pending;
}

export function astroOrNull(): CelestiaAstroModule | null {
  return instance;
}

export function astro(): CelestiaAstroModule {
  if (!instance) throw new Error('astronomy core is not loaded yet; await loadAstro() first');
  return instance;
}
