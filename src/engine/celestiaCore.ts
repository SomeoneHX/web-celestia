// Loads the WebAssembly build of Celestia's engine and drives its renderer.
//
// The engine owns the whole 3D pipeline: star catalogue, solar system, deep sky
// objects and the renderer that draws them. Everything the viewport needs goes
// through this handle; the Qt shell's own state stays where it was.

import createModule, {
  type CelestiaEngine, type CelestiaModule, type SelectedObject,
} from '@/wasm/celestia_core.js';

/** Where the engine looks for Celestia's data, relative to the site root. */
const DATA_ROOT = '/celestia-data';

/**
 * Where the ICU data file is served from.
 *
 * Celestia formats dates with ICU and Emscripten's ICU port links ICU's
 * stubdata, an empty placeholder, so it has no data at all here. The file is a
 * subset of ICU 68's own, built by tools/build-icu-data.sh, and it is handed to
 * ICU in memory: I CU loads a data file by mapping it, and its uprv_mapFile
 * returns failure without a fallback when mmap fails.
 */
const ICU_DATA_URL = '/icu/icudt68l.dat';

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

/**
 * The catalogue files named by celestia.cfg.
 *
 * CelestiaCore reads the config and loads the catalogues itself, so the front
 * end only has to make sure the files are in the file system. The list is taken
 * from the config rather than repeated here, so the two cannot drift apart.
 *
 * The paths in the config are relative ("data/stars.dat") because the front end
 * mounts them under /data, which is where a relative path resolves from.
 */
function cataloguesNamedBy(config: string): string[] {
  const names = new Set<string>();
  for (const match of config.matchAll(/"([^"]+\.(?:dat|stc|ssc|dsc))"/gi)) {
    names.add(match[1].replace(/^data\//, ''));
  }
  return [...names];
}

/** Celestia's own fonts, mounted where LoadFontHelper looks for them. */
const FONTS = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];

/**
 * Files the program ships beside its data: the startup script the core runs
 * from start(), and the logo that script overlays.
 */
const PROGRAM_FILES = ['start.cel', 'logo.png', 'demo.cel', 'guide.cel'];

/** The scripts Celestia ships in its scripts directory, for the Scripts menu. */
const SCRIPT_FILES = [
  'annum.celx', 'eclipticgrid.celx', 'galacticgrid.celx', 'horizontalgrid.celx',
  'mark-lg.celx', 'marktype.celx', 'tour-system.celx', 'z-dist.celx',
];

/**
 * The language to run in, from the browser's own preference.
 *
 * Celestia takes this from the system locale; navigator.language is the web's
 * equivalent. The catalogues are named the way gettext names them, zh-CN against
 * the browser and zh_CN against the file.
 */
export function preferredLanguage(): string {
  // An explicit choice wins; the browser's preference is the rest of the time,
  // as the system locale is for Celestia itself.
  const requested = new URLSearchParams(window.location.search).get('lang');
  if (requested !== null) return TRANSLATED_LANGUAGES.has(requested) ? requested : 'C';

  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const tag of tags) {
    const underscored = tag.replace('-', '_');
    if (TRANSLATED_LANGUAGES.has(underscored)) return underscored;
    const short = underscored.split('_')[0];
    if (TRANSLATED_LANGUAGES.has(short)) return short;
  }
  return 'C';
}

/**
 * The languages whose catalogues need glyphs DejaVuSans does not have.
 *
 * Celestia draws everything with one font, so a language written in CJK needs a
 * font that carries it; these are the subsets tools/build-cjk-fonts.py builds
 * from Noto Sans SC, one per language.
 */
const CJK_FONTS: Record<string, string> = {
  zh_CN: 'NotoSansSC-zh_CN.ttf',
  zh_TW: 'NotoSansSC-zh_TW.ttf',
  ja: 'NotoSansSC-ja.ttf',
  ko: 'NotoSansSC-ko.ttf',
};

/** The languages tools/build-translations.sh puts in public/locale. */
const TRANSLATED_LANGUAGES = new Set([
  'ar', 'be', 'bg', 'de', 'el', 'es', 'fr', 'gl', 'hu', 'it', 'ja', 'ka', 'ko',
  'lt', 'lv', 'nb', 'nl', 'pl', 'pt_BR', 'pt', 'ro', 'ru', 'sk', 'sv', 'tr',
  'uk', 'zh_CN', 'zh_TW',
]);

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
  /** Aims the camera at whatever the engine has selected. */
  centerSelection(): void;
  /** What the engine has selected, for mirroring into the shell. */
  selectedObject(): SelectedObject | null;
  /** Sets the engine's clock, in TDB Julian date. The shell owns the time. */
  setTime(tdb: number): void;
}

export interface LoadOptions {
  canvasSelector: string;
  width: number;
  height: number;
  /**
   * The sRGB rendering choice, which Qt reads out of QSettings before it builds
   * the renderer, since initRenderer takes it and cannot be told afterwards: 1
   * enabled, 2 disabled, 0 the config's own setting.
   */
  sRGBRendering?: number;
  onProgress?: (message: string) => void;
}

export async function loadCelestiaCore(options: LoadOptions): Promise<CelestiaCoreHandle> {
  const { canvasSelector, width, height, sRGBRendering = 0, onProgress } = options;
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
  // Started here so the download overlaps the mounting below; ICU cannot format
  // a date until it has landed.
  const icuData = fetch(ICU_DATA_URL).then((r) => r.arrayBuffer());

  report('Mounting textures and models');
  await mountLazyAssets(module, report);

  report('Mounting shaders');
  module.FS.mkdirTree('/shaders');
  await Promise.all(SHADERS.map(async (name) => {
    module.FS.writeFile(`/shaders/${name}`, await text(`/shaders/${name}`));
  }));

  // The startup script and its logo, which celestia.cfg's InitScript names.
  // CelestiaCore::start runs it, so the shell does not have to approximate the
  // opening view itself.
  report('Mounting the startup script');
  await Promise.all(PROGRAM_FILES.map(async (name) => {
    const bytes = await fetch(`/${name}`).then((r) => r.arrayBuffer());
    module.FS.writeFile(`/${name}`, new Uint8Array(bytes));
  }));

  // The scripts directory, which the Scripts menu is built from -- the paths in
  // the menu are the engine's, and it scans this directory itself.
  report('Mounting scripts');
  module.FS.mkdirTree('/scripts');
  await Promise.all(SCRIPT_FILES.map(async (name) => {
    const text = await fetch(`/scripts/${name}`).then((r) => r.text());
    module.FS.writeFile(`/scripts/${name}`, text);
  }));

  // Celestia ships its fonts with the program rather than in the data package,
  // and looks them up under "fonts". Without them the core reports that text
  // will not be visible, and object labels stay blank.
  report('Mounting fonts');
  module.FS.mkdirTree('/fonts');
  await Promise.all(FONTS.map(async (name) => {
    const bytes = await fetch(`/fonts/${name}`).then((r) => r.arrayBuffer());
    module.FS.writeFile(`/fonts/${name}`, new Uint8Array(bytes));
  }));

  // The engine loads its own catalogues: CelestiaCore::initSimulation reads
  // celestia.cfg, which names every file it needs, so the front end only has to
  // put them where the config says they are. Everything is written as bytes --
  // stars.dat and the cross indexes are binary, and the rest read the same
  // either way.
  report('Mounting catalogues');
  module.FS.mkdirTree('/data');
  // A CJK language needs a font that can draw it: DejaVuSans, which Celestia
  // ships, has no CJK glyphs and the interface would come out as boxes.
  // Celestia points at one through celestia.cfg, so the same key is replaced
  // here for the language in use.
  async function loadFonts(language: string): Promise<string[]> {
    const subset = CJK_FONTS[language];
    if (subset === undefined) return [];

    const bytes = await fetch(`/fonts/${subset}`).then((r) => r.arrayBuffer());
    module.FS.writeFile(`/fonts/${subset}`, new Uint8Array(bytes));
    return [subset];
  }

  function withFont(config: string, font: string): string {
    return config
      .replace(/Font\s+"[^"]*"/, `Font                         "${font},9"`)
      .replace(/TitleFont\s+"[^"]*"/, `TitleFont                    "${font},15"`)
      .replace(/LabelFont\s+"[^"]*"/, `LabelFont                    "${font},9"`);
  }

  const fonts = await loadFonts(preferredLanguage());
  const rawConfig = await text('/celestia.cfg');
  const config = fonts.length > 0 ? withFont(rawConfig, fonts[0]) : rawConfig;
  module.FS.writeFile('/celestia.cfg', config);
  await Promise.all(cataloguesNamedBy(config).map(async (name) => {
    const bytes = await fetch(`${DATA_ROOT}/${name}`).then((r) => r.arrayBuffer());
    module.FS.writeFile(`/data/${name}`, new Uint8Array(bytes));
  }));

  // The catalogue goes in before the engine starts, since the core logs and
  // formats its own strings as it initialises.
  const language = preferredLanguage();
  const engine = new module.CelestiaEngine();
  const translationDirectory = language === 'C' ? null : `/locale/${language}/LC_MESSAGES`;
  if (translationDirectory !== null) {
    report('Loading translations');
    module.FS.mkdirTree(translationDirectory);
    const catalogue = await fetch(`${translationDirectory}/celestia.mo`).then((r) => r.arrayBuffer());
    module.FS.writeFile(`${translationDirectory}/celestia.mo`, new Uint8Array(catalogue));
  }

  // Bound before the engine starts as well: the core reports its progress while
  // it reads the catalogues, and those messages go to the splash, which is
  // translated. The binding is repeated below because starting the engine resets
  // the domain, and the engine's own strings are looked up as it draws.
  if (translationDirectory !== null) engine.bindTextDomain(translationDirectory);

  // CelestiaCore's own loading progress, in the form the Qt splash shows it:
  // "Loading data files: %1", which the catalogue translates.
  const progressFormat = engine.translate('Loading data files: %1\n\n');
  engine.setProgressCallback((message) => {
    report(progressFormat.replace('%1', message));
  });

  // ICU must have its data before the engine is built: the HUD's date is
  // formatted through it, and without data that date is empty, which leaves the
  // time rate and the field of view beside it measured against an empty string
  // and drawn off the right edge of the viewport.
  report('Loading ICU data');
  const icuError = module.setIcuData(new Uint8Array(await icuData));
  if (icuError !== 0) console.error(`[celestia] ICU refused its data (error ${icuError})`);

  report('Starting the engine');
  if (!engine.initRenderer(canvasSelector, width, height, sRGBRendering))
    throw new Error('initRenderer failed');

  // The catalogue is pointed at once the engine has started: initialising the
  // simulation and running the startup script resets the domain, and the
  // engine's strings are looked up as it draws, so binding afterwards is what
  // makes them translate.
  if (translationDirectory !== null) engine.bindTextDomain(translationDirectory);

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
    centerSelection: () => engine.centerSelection(),
    selectedObject: () => engine.selectedObject(),
    setTime: (tdb: number) => engine.setTime(tdb),
  };

  return handle;
}
