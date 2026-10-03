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

/** Lists the textures and models the engine may ask for, with their sizes. */
interface AssetManifest {
  files: Record<string, number>;
}

/**
 * Resolves a path the engine asked for against the working directory.
 *
 * The engine names its assets relative to the working directory and reaches the
 * file system as "//models/SBa.png": Emscripten joins a relative path against a
 * working directory of "/" without collapsing the separator, and FS.lookupPath
 * accepts the result as it stands. Placeholders are keyed by the normalised
 * path, so the separator is collapsed here.
 */
function absolutePath(cwd: string, path: string): string {
  return (path.startsWith('/') ? path : `${cwd}/${path}`).replace(/\/{2,}/g, '/');
}

/**
 * Mounts Celestia's textures and models without downloading them.
 *
 * The engine decides whether a texture exists while it parses a catalogue --
 * TexturePaths::checkPath and GeometryPaths::checkPath both answer with
 * std::filesystem::status -- but reads the bytes later, when a frame draws the
 * body. So every asset is created as an empty placeholder now, and its bytes
 * are fetched the first time the engine opens the file.
 *
 * Loading them all up front is not an option: the set is 219 MB. Nor is
 * mounting only one resolution directory, because CelestiaContent keeps the
 * main planet maps in textures/hires and leaves textures/lores and medres with
 * just the maps hires does not carry, so the renderer would lose the very
 * surfaces it asks for.
 */
async function mountLazyAssets(module: CelestiaModule, report: (message: string) => void): Promise<void> {
  let manifest: AssetManifest | null = null;
  try {
    const response = await fetch(`${DATA_ROOT}/assets.json`);
    if (response.ok) manifest = await response.json() as AssetManifest;
  } catch {
    manifest = null;
  }

  const files = manifest?.files ?? {};
  const paths = Object.keys(files);
  if (paths.length === 0) {
    // Without the manifest the engine still runs; bodies simply have no surface.
    report('No assets.json, drawing bodies without textures');
    return;
  }

  const { FS } = module;

  /** Assets still held as placeholders, keyed by their path in the file system. */
  const pending = new Map<string, string>();

  const materialise = (path: string): void => {
    const url = pending.get(path);
    if (url === undefined) return;

    // Dropped first: FS.writeFile opens the file itself, and re-entering here
    // would fetch the same asset a second time.
    pending.delete(path);

    try {
      const request = new XMLHttpRequest();
      request.open('GET', url, false);
      // A synchronous request from a document may not set responseType, so the
      // bytes come back as text through the binary-safe x-user-defined charset
      // and are masked straight back into a byte array. The high half of that
      // charset maps 0x80-0xff to U+F780-U+F7FF, which is why the mask is
      // needed rather than a bare charCodeAt.
      request.overrideMimeType('text/plain; charset=x-user-defined');
      request.send(null);
      if (request.status < 200 || request.status >= 300)
        throw new Error(`status ${request.status}`);

      const body = request.responseText;
      const bytes = new Uint8Array(body.length);
      for (let i = 0; i < body.length; i += 1)
        bytes[i] = body.charCodeAt(i) & 0xff;

      FS.writeFile(path, bytes);
    } catch (error) {
      console.error(`[celestia] could not load ${url}`, error);
    }
  };

  for (const path of paths) {
    const target = `/${path}`;
    FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
    FS.writeFile(target, new Uint8Array(0));
    pending.set(target, `${DATA_ROOT}/${path}`);
  }


  // Emscripten's own lazy files refuse to run on the main thread -- libfs.js
  // aborts rather than issue a synchronous binary XHR outside a worker -- so
  // the fetch lives here, at the one call every read has to pass through.
  //
  // The engine names textures and meshes relative to the working directory
  // ("textures/hires/earth.png", "models/phobos.cmod"), so the path is resolved
  // against it before the lookup. FS.writeFile below opens the absolute path,
  // which is what keeps this from re-entering.
  const open = FS.open.bind(FS);
  FS.open = (path: string, flags: number | string, mode?: number) => {
    materialise(absolutePath(FS.cwd(), path));
    return open(path, flags, mode);
  };

  const bytes = paths.reduce((sum, path) => sum + (files[path] ?? 0), 0);
  report(`Mounted ${paths.length} textures and models (${(bytes / 1048576).toFixed(1)} MB on demand)`);
}

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
  /**
   * Rotates the camera by a drag, in drawable pixels.
   *
   * CelestiaCore::mouseMove is given drawable pixels too: the Qt widget scales
   * the pointer coordinates by the device pixel ratio before handing them over.
   */
  orbitBy(dx: number, dy: number): void;
  /**
   * Orbits the camera around the selection, in drawable pixels. This is the
   * drag that moves the camera rather than turning it.
   */
  orbitAroundSelection(dx: number, dy: number): void;
  /** Narrows or widens the field of view by a drag, in drawable pixels. */
  zoomByDrag(dy: number): void;
  /** Moves the camera closer to or further from the selection. */
  dolly(amount: number): void;
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

  // Mounted before anything is parsed: a catalogue resolves its textures and
  // meshes as it loads, and only files that exist by then get a handle.
  report('Mounting textures and models');
  await mountLazyAssets(module, report);

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

  // The drawable size, in the same pixels the drag is measured in. The renderer
  // is told about it in initRenderer, and a drag divides by it, so the two have
  // to stay in step.
  let size = { width, height };

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
    resize: (w: number, h: number) => {
      size = { width: w, height: h };
      engine.resizeRenderer(w, h);
    },
    gotoObject: (path: string, distanceKm: number) => engine.gotoObject(path, distanceKm),
    // The engine turns the rotation into a quaternion itself, from the drag and
    // the drawable size, the way CelestiaCore does.
    orbitBy: (dx: number, dy: number) => {
      engine.rotateObserverByDrag(dx, dy, size.width, size.height);
    },
    orbitAroundSelection: (dx: number, dy: number) => {
      engine.orbitObserverByDrag(dx, dy, size.width, size.height);
    },
    zoomByDrag: (dy: number) => {
      engine.zoomObserverByDrag(dy, size.height);
    },
    dolly: (amount: number) => {
      engine.changeDistance(amount);
    },
    zoomBy: (factor: number) => {
      const fov = engine.observerFov();
      // Observer stores FOV in radians; these are PerspectiveProjectionMode's
      // original limits (0.001 degrees through 120 degrees).
      const radians = Math.PI / 180;
      const next = Math.min(Math.max(fov * factor, 0.001 * radians), 120 * radians);
      engine.setObserverFov(next);
    },
    centerSelection: () => engine.centerSelection(),
  };

  return handle;
}
