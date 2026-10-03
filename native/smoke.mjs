// Drives the compiled Celestia engine through its wasm bindings and prints what
// the engine reports. Run it after `bash native/build.sh`:
//
//   node native/smoke.mjs [dataDir]
//
// dataDir defaults to a checkout of the CelestiaContent repository, which holds
// the star catalogues and solar system definitions the engine reads.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import createCelestiaCore from '../src/wasm/celestia_core.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2] ?? join(here, '..', 'celestia-data');
const read = (name) => readFileSync(join(dataDir, name), 'utf8');

let module;
try {
  module = await createCelestiaCore({
    print: (text) => console.log('[engine]', text),
    printErr: (text) => console.error('[engine]', text),
  });
} catch (error) {
  console.error('module initialisation failed:', error);
  if (error && typeof error.excPtr === 'number') {
    try {
      const helper = (await import('../src/wasm/celestia_core.js')).getExceptionMessage ?? globalThis.getExceptionMessage;
      if (helper) console.error(helper(error.excPtr));
    } catch (inner) {
      console.error('could not decode exception:', inner);
    }
  }
  process.exit(1);
}

const engine = new module.CelestiaEngine();

function step(label, fn) {
  try {
    const value = fn();
    console.log(`${label}: ok${value === undefined ? '' : ` -> ${value}`}`);
    return value;
  } catch (error) {
    console.error(`${label}: threw ${error}`);
    return undefined;
  }
}

step('loadStarCatalog', () => engine.loadStarCatalog(read('stars-near.stc')));
console.log(`  starCount=${engine.starCount()}`);

step('loadSolarSystem', () => engine.loadSolarSystem(read('solarsys.ssc')));
console.log(`  solarSystemCount=${engine.solarSystemCount()}`);

step('start', () => {
  engine.start();
});
console.log(`  hasSimulation=${engine.hasSimulation()}`);

const tdb = engine.getTime();
for (const path of ['Sol', 'Sol/Earth', 'Sol/Earth/Moon', 'Sol/Mars', 'Sol/Jupiter', 'Sol/Saturn']) {
  const kind = step(`objectType(${path})`, () => engine.objectType(path));
  if (kind === undefined || kind === 'None') continue;
  const radius = engine.objectRadiusKm(path);
  const position = engine.objectPositionKm(path, tdb);
  const au = [];
  for (let i = 0; i < position.size(); i++) au.push((position.get(i) / 149597870.7).toFixed(4));
  position.delete();
  console.log(`  radiusKm=${radius.toFixed(1)} au=[${au.join(', ')}]`);
}
