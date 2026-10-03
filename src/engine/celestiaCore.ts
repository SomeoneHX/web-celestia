// Loads the WebAssembly build of Celestia's engine and drives its renderer.
//
// The engine owns the whole 3D pipeline: star catalogue, solar system, deep sky
// objects and the renderer that draws them. Everything the viewport needs goes
// through this handle; the Qt shell's own state stays where it was.

import createModule, { type CelestiaEngine, type CelestiaModule } from '@/wasm/celestia_core.js';

/** Where the engine looks for Celestia's data, relative to the site root. */
const DATA_ROOT = '/celestia-data';

/** ShaderManager loads these from the relative directory "shaders". */
const SHADERS = [
  'comet_frag.glsl', 'comet_vert.glsl', 'crosshair_frag.glsl', 'crosshair_vert.glsl',
  'depth_frag.glsl', 'depth_vert.glsl', 'galaxy_frag.glsl', 'galaxy_vert.glsl',
  'globular_frag.glsl', 'globular_vert.glsl', 'largestar_frag.glsl', 'largestar_vert.glsl',
  'psfstarglow_frag.glsl', 'psfstarglow_vert.glsl', 'psfstarglowlarge_frag.glsl',
  'psfstarglowlarge_vert.glsl', 'psfstarpoint_frag.glsl', 'psfstarpoint_vert.glsl',
  'selpointer_frag.glsl', 'selpointer_vert.glsl', 'srgb_frag.glsl', 'srgb_vert.glsl',
  'star_frag.glsl', 'star_vert.glsl', 'text_frag.glsl', 'text_vert.glsl',
  'tidal_frag.glsl', 'tidal_vert.glsl', 'warpmesh_frag.glsl', 'warpmesh_vert.glsl',
];

const STAR_CATALOGS = [
  'stars-named.stc', 'stars-charm2.stc', 'stars-visualbins.stc', 'stars-spectbins.stc',
  'whitedwarfs.stc', 'pulsars.stc', 'extrasolar.stc', 'stars-revised.stc', 'stars-near.stc',
];

const DEEP_SKY_CATALOGS = ['galaxies.dsc', 'globulars.dsc', 'openclusters.dsc'];

const text = (url: string) => fetch(url).then((response) => {
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return response.text();
});

/** What the viewport drives. */
export interface CelestiaCoreHandle {
  readonly module: CelestiaModule;
  readonly engine: CelestiaEngine;
  readonly starCount: number;
  readonly dsoCount: number;
  renderFrame(): void;
  resize(width: number, height: number): void;
  /** Selects an object and places the observer distanceKm away from it. */
  gotoObject(path: string, distanceKm: number): boolean;
  /** Rotates the camera by a drag in pixels. */
  orbitBy(dx: number, dy: number): void;
  /** Widens or narrows the field of view. */
  zoomBy(factor: number): void;
  /** Aims the camera at whatever the engine has selected. */
  centerSelection(): void;
}

export interface LoadOptions {
  canvasSelector: string;
  width: number;
  height: number;
  onProgress?: (message: string) => void;
}

export async function loadCelestiaCore(options: LoadOptions): Promise<CelestiaCoreHandle> {
  const { canvasSelector, width, height, onProgress } = options;
  const report = onProgress ?? (() => {});

  report('Loading engine');
  const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
  if (canvas === null) throw new Error(`canvas ${canvasSelector} not found`);

  const module = await createModule({
    canvas,
    print: (line: string) => console.log('[celestia]', line),
    printErr: (line: string) => console.error('[celestia]', line),
  });

  report('Mounting shaders');
  module.FS.mkdirTree('/shaders');
  await Promise.all(SHADERS.map(async (name) => {
    module.FS.writeFile(`/shaders/${name}`, await text(`/shaders/${name}`));
  }));

  // The binary catalogue is read through the engine's file system.
  report('Mounting star catalogue');
  module.FS.mkdirTree('/data');
  const stars = await fetch(`${DATA_ROOT}/stars.dat`).then((r) => r.arrayBuffer());
  module.FS.writeFile('/data/stars.dat', new Uint8Array(stars));
  module.FS.writeFile('/data/starnames.dat', await text(`${DATA_ROOT}/starnames.dat`));

  const engine = new module.CelestiaEngine();

  report('Loading stars');
  const starLists = new module.VectorString();
  for (const name of STAR_CATALOGS) starLists.push_back(await text(`${DATA_ROOT}/${name}`));
  if (!engine.loadStars('/data/stars.dat', '/data/starnames.dat', starLists))
    throw new Error('loadStars failed');
  starLists.delete();

  report('Loading deep sky objects');
  const deepSky = new module.VectorString();
  for (const name of DEEP_SKY_CATALOGS) deepSky.push_back(await text(`${DATA_ROOT}/${name}`));
  if (!engine.loadDeepSky(deepSky)) throw new Error('loadDeepSky failed');
  deepSky.delete();

  report('Loading constellations');
  engine.loadAsterisms(await text(`${DATA_ROOT}/asterisms.dat`));
  engine.loadBoundaries(await text(`${DATA_ROOT}/boundaries.dat`));

  report('Loading solar system');
  if (!engine.loadSolarSystem(await text(`${DATA_ROOT}/solarsys.ssc`)))
    throw new Error('loadSolarSystem failed');

  engine.start();
  if (!engine.initRenderer(canvasSelector, width, height))
    throw new Error('initRenderer failed');

  const handle: CelestiaCoreHandle = {
    module,
    engine,
    get starCount() {
      return engine.starCount();
    },
    get dsoCount() {
      return engine.dsoCount();
    },
    renderFrame: () => engine.renderFrame(),
    resize: (w: number, h: number) => engine.resizeRenderer(w, h),
    gotoObject: (path: string, distanceKm: number) => engine.gotoObject(path, distanceKm),
    orbitBy: (dx: number, dy: number) => {
      // Dragging right turns the camera left, which is what Celestia's own
      // mouse handling does.
      const yaw = -dx * 0.005;
      const pitch = -dy * 0.005;
      const orientation = engine.observerOrientation();
      const current: [number, number, number, number] = [
        orientation.get(0), orientation.get(1), orientation.get(2), orientation.get(3),
      ];
      orientation.delete();
      const yawQ = quaternionFromAxisAngle(0, 1, 0, yaw);
      const pitchQ = quaternionFromAxisAngle(1, 0, 0, pitch);
      const rotated = quaternionMultiply(quaternionMultiply(yawQ, pitchQ), current);
      engine.setObserverOrientation(rotated[0], rotated[1], rotated[2], rotated[3]);
    },
    zoomBy: (factor: number) => {
      const fov = engine.observerFov();
      const next = Math.min(Math.max(fov * factor, 0.01), 120);
      engine.setObserverFov(next);
    },
    centerSelection: () => engine.centerSelection(),
  };

  return handle;
}

function quaternionFromAxisAngle(x: number, y: number, z: number, angle: number): [number, number, number, number] {
  const half = angle / 2;
  const s = Math.sin(half);
  return [x * s, y * s, z * s, Math.cos(half)];
}

function quaternionMultiply(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
