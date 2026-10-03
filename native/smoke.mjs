// Drives the compiled Celestia engine through its wasm bindings and prints what
// the engine reports. Run it after `bash native/build.sh`:
//
//   node native/smoke.mjs [dataDir]
//
// dataDir defaults to the celestia-data directory produced by
// tools/fetch-celestia-data.sh. The file lists follow celestia.cfg.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import createCelestiaCore from '../src/wasm/celestia_core.js';

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

const DEEP_SKY_CATALOGS = ['galaxies.dsc', 'globulars.dsc', 'openclusters.dsc'];

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2] ?? join(here, '..', 'celestia-data');
const readText = (name) => readFileSync(join(dataDir, name), 'utf8');

const module = await createCelestiaCore({
  print: (text) => console.log('[engine]', text),
  printErr: (text) => console.error('[engine]', text),
});

// The binary catalogue is read through the file system, so the files are
// written there first.
const starsPath = '/celestia/stars.dat';
const namesPath = '/celestia/starnames.dat';
module.FS.mkdirTree('/celestia');
module.FS.writeFile(starsPath, new Uint8Array(readFileSync(join(dataDir, 'stars.dat'))));
module.FS.writeFile(namesPath, new Uint8Array(readFileSync(join(dataDir, 'starnames.dat'))));

const engine = new module.CelestiaEngine();
const timed = (fn) => {
  const started = Date.now();
  const result = fn();
  return `${result}   ${Date.now() - started} ms`;
};

const stars = new module.VectorString();
for (const name of TEXT_CATALOGS) stars.push_back(readText(name));
console.log(`loadStars       -> ${timed(() => engine.loadStars(starsPath, namesPath, stars))}  starCount=${engine.starCount()}`);
stars.delete();

const deepSky = new module.VectorString();
for (const name of DEEP_SKY_CATALOGS) deepSky.push_back(readText(name));
console.log(`loadDeepSky     -> ${timed(() => engine.loadDeepSky(deepSky))}  dsoCount=${engine.dsoCount()}`);
deepSky.delete();

console.log(`loadAsterisms   -> ${timed(() => engine.loadAsterisms(readText('asterisms.dat')))}  asterismCount=${engine.asterismCount()}`);
console.log(`loadSolarSystem -> ${timed(() => engine.loadSolarSystem(readText('solarsys.ssc')))}  solarSystemCount=${engine.solarSystemCount()}`);

engine.start();
console.log(`hasSimulation=${engine.hasSimulation()}`);

const tdb = engine.getTime();
const paths = ['Sol', 'Sol/Earth', 'Sol/Earth/Moon', 'Sol/Mars', 'Sol/Jupiter', 'Sol/Saturn', 'Sol/Neptune', 'Andromeda Galaxy'];
for (const path of paths) {
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
  console.log(`${path.padEnd(18)} ${kind.padEnd(8)} radiusKm=${radius.toFixed(1).padStart(10)}  au=[${au.join(', ')}]`);
}
