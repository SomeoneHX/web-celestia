// Drives the compiled Celestia engine through its wasm bindings and prints what
// the engine reports. Run it after `bash native/build.sh`:
//
//   node native/smoke.mjs [dataDir]
//
// dataDir defaults to the celestia-data directory produced by
// tools/fetch-celestia-data.sh.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import createCelestiaCore from '../src/wasm/celestia_core.js';

// The star catalogues Celestia's celestia.cfg lists, in the same order.
const TEXT_CATALOGS = [
  'stars-named.stc',
  'stars-charm2.stc',
  'stars-visualbins.stc',
  'stars-spectbins.stc',
  'whitedwarfs.stc',
  'pulsars.stc',
  'extrasolar.stc',
  'stars-revised.stc',
  'stars-near.stc',
];

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2] ?? join(here, '..', 'celestia-data');
const readText = (name) => readFileSync(join(dataDir, name), 'utf8');

const module = await createCelestiaCore({
  print: (text) => console.log('[engine]', text),
  printErr: (text) => console.error('[engine]', text),
});

// The engine reads the binary catalogue through the file system, so the files
// are written there first.
const starsPath = '/celestia/stars.dat';
const namesPath = '/celestia/starnames.dat';
module.FS.mkdirTree('/celestia');
module.FS.writeFile(starsPath, new Uint8Array(readFileSync(join(dataDir, 'stars.dat'))));
module.FS.writeFile(namesPath, new Uint8Array(readFileSync(join(dataDir, 'starnames.dat'))));

const engine = new module.CelestiaEngine();

const catalogs = new module.VectorString();
for (const name of TEXT_CATALOGS)
  catalogs.push_back(readText(name));

let started = Date.now();
const starsOk = engine.loadStars(starsPath, namesPath, catalogs);
catalogs.delete();
console.log(`loadStars -> ${starsOk}   ${Date.now() - started} ms, starCount=${engine.starCount()}`);

started = Date.now();
const sscOk = engine.loadSolarSystem(readText('solarsys.ssc'));
console.log(`loadSolarSystem -> ${sscOk}   ${Date.now() - started} ms, solarSystemCount=${engine.solarSystemCount()}`);

engine.start();
console.log(`hasSimulation=${engine.hasSimulation()}`);

const tdb = engine.getTime();
for (const path of ['Sol', 'Sol/Earth', 'Sol/Earth/Moon', 'Sol/Mars', 'Sol/Jupiter', 'Sol/Saturn', 'Sol/Neptune']) {
  const kind = engine.objectType(path);
  if (kind === 'None') {
    console.log(`${path}: not found`);
    continue;
  }
  const radius = engine.objectRadiusKm(path);
  const position = engine.objectPositionKm(path, tdb);
  const au = [];
  for (let i = 0; i < position.size(); i++)
    au.push((position.get(i) / 149597870.7).toFixed(4));
  position.delete();
  console.log(`${path.padEnd(16)} ${kind.padEnd(5)} radiusKm=${radius.toFixed(1).padStart(10)}  au=[${au.join(', ')}]`);
}
