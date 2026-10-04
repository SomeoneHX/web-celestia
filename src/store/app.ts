// Application state.
//
// The simulation, observer and renderer are large mutable objects that change
// every frame, so they are deliberately kept outside Vue's reactivity graph. The
// reactive part of this module mirrors the settings the shell reads and writes,
// and pushes changes down to the engine through explicit actions.

import { reactive, shallowRef, triggerRef } from 'vue';
import type { CelestiaCoreHandle } from '@/engine/celestiaCore';
import { applyStoredSettings, captureSettings, loadSettings, saveSettings } from './settings';
import {
  RenderFlags, RenderLabels, StarStyle, TextureResolution, HudDetail, DateFormat, BodyClassification,
} from '@/core/celestia';
import { setStarColorTable, getStarColorTable, type StarColorTable } from '@/render/starcolor';
import { buildInfoPage } from '@/core/objectInfo';
import { vec3 } from '@/core/math';

export interface BookmarkFolder {
  id: string;
  title: string;
  description: string;
  folded: boolean;
  children: BookmarkNode[];
}

export type BookmarkNode =
  | { kind: 'bookmark'; id: string; title: string; description: string; url: string }
  | { kind: 'separator'; id: string }
  | { kind: 'folder'; folder: BookmarkFolder };

export interface BrowserTab {
  id: 'solar-system' | 'stars' | 'deep-sky';
  title: string;
}

/** Reactive mirror of everything the shell's widgets bind to. */
export interface UiState {
  /** The astronomy core the tool bars need is loaded; the window can be built. */
  astroReady: boolean;
  /** The engine has started: the splash goes away, as QSplashScreen::finish does. */
  ready: boolean;
  loadingFraction: number;
  loadingMessage: string;
  error: string | null;

  // Dock and toolbar visibility, mirroring the View menu.
  showTimeToolBar: boolean;
  showGuidesToolBar: boolean;
  showBookmarkToolBar: boolean;
  showCelestialBrowser: boolean;
  showInfoBrowser: boolean;
  showEventFinder: boolean;
  fullScreen: boolean;

  // Render flags. Held as a BigInt; the shell reads individual bits through the
  // helper functions below.
  renderFlags: bigint;
  labelMode: number;
  orbitMask: number;

  starStyle: StarStyle;
  resolution: TextureResolution;
  measurementSystem: number;
  starColorTable: StarColorTable;

  faintestVisible: number;
  autoMag: boolean;
  faintestAM45deg: number;
  starExposure: number;

  starPointRadius: number;
  starOptimization: number;
  starMaxIrradiance: number;
  starDimClipFactor: number;

  ambientLightLevel: number;
  tintSaturation: number;
  minimumFeatureSize: number;
  atmosphereSegmentCount: number;
  cloudSegmentCount: number;
  separateRayleighMieScaleHeights: boolean;

  sRGBRendering: number; // 0 = config default, 1 = enabled, 2 = disabled
  toneMappingMode: number;
  toneMappingExposure: number;

  hudDetail: HudDetail;
  timeZoneBias: number;
  dateFormat: DateFormat;
  lightDelayActive: boolean;

  // Time control.
  timeScale: number;
  paused: boolean;

  // Selection mirror, refreshed when the selection changes.
  /**
   * Bumped when the core is registered. Labels are translated through the core's
   * catalogue, which only exists once it does, so anything holding translated
   * text watches this to rebuild when the catalogue becomes available.
   */
  engineGeneration: number;
  selectionKind: 'none' | 'star' | 'deepsky' | 'body' | 'location';
  selectionName: string;
  selectionInfo: string;

  // Transient message shown at the bottom of the viewport.
  message: string;

  // Dialogs.
  openDialog: string | null;
  dialogPayload: unknown;

  // Browsers.
  activeBrowserTab: string;
  solarSystemSelection: string | null;

  // Scripts found in the public scripts directory.
  scripts: Array<{ title: string; path: string }>;

  // Statistics for the HUD.
  fps: number;
  bodyCount: number;
  starCount: number;
}

/**
 * The WebAssembly viewport, which is the whole engine.
 *
 * CelestiaCore owns the universe, the simulation, the observer and the renderer,
 * and the panels and lists read it through the handle registered here.
 */
let viewportRef: CelestiaCoreHandle | null = null;

/**
 * Stores the settings, a little after the last change.
 *
 * QSettings is written when the window closes; a browser tab can be closed
 * without warning, so this writes on a delay instead, and the page's own
 * beforeunload handler writes one last time.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function storeSettings(): void {
  // Nothing is written before the engine exists. The watcher fires while the
  // window is still coming up -- the stored values are being put in, among other
  // things -- and reading a settings blob out of an engine that is not there yet
  // would write its defaults over what was stored.
  if (viewportRef === null) return;

  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (viewportRef === null) return;
    saveSettings(captureSettings(viewportRef.engine, ui, {
      menu: bookmarks.menu as unknown[],
      toolbar: bookmarks.toolbar as unknown[],
    }));
  }, 400);
}

/** Writes the settings now, for a page that is going away. */
export function storeSettingsNow(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (viewportRef === null) return;
  saveSettings(captureSettings(viewportRef.engine, ui, {
    menu: bookmarks.menu as unknown[],
    toolbar: bookmarks.toolbar as unknown[],
  }));
}

/**
 * Puts back what was stored, as CelestiaAppWindow::readSettings does at startup.
 *
 * Called once the engine exists and before the shell takes its state from the
 * engine, so the window shows what was restored rather than its own defaults.
 * Returns nothing: a stored setting that the engine refuses is not worth
 * interrupting the start for.
 */
export function restoreSettings(): void {
  const stored = loadSettings();
  if (stored === null || viewportRef === null) return;

  applyStoredSettings(viewportRef.engine, stored);

  const engine = viewportRef.engine;
  const settings = engine.settings();
  ui.renderFlags = BigInt(engine.renderFlags());
  ui.labelMode = engine.labelMode();
  ui.orbitMask = engine.orbitMask();
  ui.starStyle = engine.starStyle() as StarStyle;
  ui.resolution = settings.resolution as TextureResolution;
  // The star colour table is the front end's: it is a table of colours handed to
  // the renderer rather than a value the engine holds, so applying it is what
  // restores it.
  applyStarColorTable(settings.starColorTable as unknown as StarColorTable);
  ui.faintestVisible = settings.faintestVisible ?? ui.faintestVisible;
  ui.ambientLightLevel = settings.ambientLightLevel;
  ui.tintSaturation = settings.tintSaturation;
  ui.toneMappingMode = settings.toneMappingMode;
  ui.toneMappingExposure = settings.toneMappingExposure;
  ui.hudDetail = engine.hudDetail() as HudDetail;
  ui.dateFormat = engine.dateFormat() as DateFormat;
  ui.timeZoneBias = engine.timeZoneBias();
  ui.lightDelayActive = engine.lightDelayActive();

  ui.showTimeToolBar = stored.showTimeToolBar;
  ui.showGuidesToolBar = stored.showGuidesToolBar;
  ui.showBookmarkToolBar = stored.showBookmarkToolBar;
  ui.showCelestialBrowser = stored.showCelestialBrowser;
  ui.showInfoBrowser = stored.showInfoBrowser;
  ui.showEventFinder = stored.showEventFinder;
  ui.fps = stored.fps;

  if (Array.isArray(stored.bookmarks?.menu)) bookmarks.menu = stored.bookmarks.menu as typeof bookmarks.menu;
  if (Array.isArray(stored.bookmarks?.toolbar)) bookmarks.toolbar = stored.bookmarks.toolbar as typeof bookmarks.toolbar;
}

export function setCore(core: CelestiaCoreHandle | null): void {
  viewportRef = core;
  ui.engineGeneration += 1;
  // The Qt window hides its splash only once the core has started and the
  // window is up (qtmain.cpp calls finish after startAppCore), so the splash
  // covers the whole of the catalogue loading rather than a black canvas.
  ui.ready = core !== null;
}

export function viewport(): CelestiaCoreHandle | null {
  return viewportRef;
}

export const ui = reactive<UiState>({
  astroReady: false,
  ready: false,
  loadingFraction: 0,
  loadingMessage: '',
  error: null,

  showTimeToolBar: true,
  showGuidesToolBar: true,
  showBookmarkToolBar: true,
  showCelestialBrowser: false,
  showInfoBrowser: false,
  showEventFinder: false,
  fullScreen: false,

  renderFlags: 0n,
  labelMode: 0,
  orbitMask: 0x3ff,

  starStyle: StarStyle.PointSpreadFunction,
  resolution: TextureResolution.Medium,
  measurementSystem: 0,
  starColorTable: 'Blackbody_D65',

  faintestVisible: 6.5,
  autoMag: true,
  faintestAM45deg: 8.5,
  starExposure: 1.0,

  starPointRadius: 1.5,
  starOptimization: 0.1,
  starMaxIrradiance: 100,
  starDimClipFactor: 10,

  ambientLightLevel: 0,
  tintSaturation: 1,
  minimumFeatureSize: 100,
  atmosphereSegmentCount: 4,
  cloudSegmentCount: 4,
  separateRayleighMieScaleHeights: false,

  sRGBRendering: 0,
  toneMappingMode: 0,
  toneMappingExposure: 1,

  hudDetail: HudDetail.Terse,
  timeZoneBias: 0,
  dateFormat: DateFormat.Locale,
  lightDelayActive: false,

  timeScale: 1,
  paused: false,

  engineGeneration: 0,
  selectionKind: 'none',
  selectionName: '',
  selectionInfo: '',

  message: '',

  openDialog: null,
  dialogPayload: null,

  activeBrowserTab: 'solar-system',
  solarSystemSelection: null,

  scripts: [],

  fps: 0,
  bodyCount: 0,
  starCount: 0,
});

/** Copies the engine's current settings into the reactive mirror. */
/**
 * Copies the core's display settings into the reactive mirror.
 *
 * The core holds them and its renderer draws them, so the shell reads them back
 * rather than keeping a second copy that could disagree; this is the same
 * arrangement as the selection. Called when the core is registered and whenever
 * a dialog has written to the core directly.
 */
export function syncFromEngine(): void {
  const view = viewportRef;
  if (view === null) return;

  const s = view.engine.settings();
  ui.renderFlags = BigInt(s.renderFlags);
  ui.labelMode = s.labelMode;
  ui.orbitMask = s.orbitMask;
  ui.starStyle = s.starStyle as StarStyle;
  ui.resolution = s.resolution as TextureResolution;
  ui.starColorTable = getStarColorTable();
  ui.faintestVisible = s.faintestVisible ?? ui.faintestVisible;
  ui.faintestAM45deg = s.faintestAM45deg;
  ui.starExposure = s.starExposure;
  ui.starPointRadius = s.starPointRadius;
  ui.starOptimization = s.starOptimization;
  ui.starMaxIrradiance = s.starMaxIrradiance;
  ui.starDimClipFactor = s.starDimClipFactor;
  ui.ambientLightLevel = s.ambientLightLevel;
  ui.tintSaturation = s.tintSaturation;
  ui.minimumFeatureSize = s.minimumFeatureSize;
  ui.atmosphereSegmentCount = s.atmosphereSegmentCount;
  ui.cloudSegmentCount = s.cloudSegmentCount;
  ui.separateRayleighMieScaleHeights = s.separateRayleighMieScaleHeights;
  ui.toneMappingMode = s.toneMappingMode;
  ui.toneMappingExposure = s.toneMappingExposure;
  ui.measurementSystem = s.measurementSystem;
  ui.hudDetail = s.hudDetail as HudDetail;
  ui.timeZoneBias = s.timeZoneBias;
  ui.dateFormat = s.dateFormat as DateFormat;
  ui.timeScale = s.timeScale ?? 1;
  ui.paused = s.paused ?? false;
  ui.autoMag = (ui.renderFlags & RenderFlags.ShowAutoMag) !== 0n;
  triggerRef(viewportRef as never);
}

// -------------------------------------------------------------- flag helpers

export function hasFlag(flag: bigint): boolean {
  return (ui.renderFlags & flag) !== 0n;
}

export function toggleFlag(flag: bigint): void {
  setFlags(ui.renderFlags ^ flag);
}

export function setFlag(flag: bigint, enabled: boolean): void {
  setFlags(enabled ? ui.renderFlags | flag : ui.renderFlags & ~flag);
}

export function setFlags(flags: bigint): void {
  ui.renderFlags = flags;
  viewportRef?.engine.setRenderFlags(Number(flags));
}

export function hasLabel(flag: number): boolean {
  return (ui.labelMode & flag) !== 0;
}

export function setLabel(flag: number, enabled: boolean): void {
  ui.labelMode = enabled ? ui.labelMode | flag : ui.labelMode & ~flag;
  viewportRef?.engine.setLabelMode(ui.labelMode);
}

export function toggleLabel(flag: number): void {
  setLabel(flag, !hasLabel(flag));
}

export function setOrbitClassification(flag: number, enabled: boolean): void {
  ui.orbitMask = enabled ? ui.orbitMask | flag : ui.orbitMask & ~flag;
  viewportRef?.engine.setOrbitMask(ui.orbitMask);
}

// ------------------------------------------------------------------- actions

/**
 * Shows a transient message. The HUD draws it, as it does in Celestia's own
 * front ends, which call appCore->flash and let the HUD render the text; the
 * shell has no message of its own.
 */
export function showMessage(text: string, durationSeconds = 3): void {
  // Before the core exists -- the loading progress messages -- there is nothing
  // to draw with yet, so they are only logged.
  const view = viewportRef;
  if (view !== null) view.engine.flash(text, durationSeconds);
  else console.info('[celestia]', text);
}

/**
 * Translates a message through the core's catalogue.
 *
 * Celestia's own front end calls _() for its labels, and the same catalogue
 * carries them, so the shell asks the core rather than keeping translations of
 * its own. Falls back to the message when the core is not up yet.
 */
export function t(message: string): string {
  const view = viewportRef;
  if (view === null) return message;
  const translated = view.engine.translate(message);
  return translated === '' ? message : translated;
}

export function openDialog(name: string, payload: unknown = null): void {
  ui.openDialog = name;
  ui.dialogPayload = payload;
}

export function closeDialog(): void {
  ui.openDialog = null;
  ui.dialogPayload = null;
}

export function refreshSelectionMirror(): void {
  const picked = viewportRef?.engine.selectedObject() ?? null;
  const kind = picked === null ? 'none' : picked.type.toLowerCase();
  ui.selectionKind = (['star', 'body', 'deepsky', 'location'].includes(kind) ? kind : 'none') as UiState['selectionKind'];
  ui.selectionName = picked?.name ?? '';
  ui.selectionInfo = buildInfoPage(viewportRef, picked);
}

export function applyStarStyle(style: StarStyle): void {
  ui.starStyle = style;
  viewportRef?.engine.setStarStyle(style);
}

export function applyResolution(resolution: TextureResolution): void {
  ui.resolution = resolution;
  viewportRef?.engine.setResolution(resolution);
}

export function applyStarColorTable(table: StarColorTable): void {
  ui.starColorTable = table;
  setStarColorTable(table);
}

// ------------------------------------------------------------ time helpers
//
// The core owns the clock. Its tick advances the date by dt * timeScale unless
// it is paused, so these drive the core and the shell reads the date back from
// it rather than keeping a second clock that could drift.

export function setTimeScale(scale: number): void {
  ui.timeScale = scale;
  viewportRef?.engine.setTimeScale(scale);
}

export function setPaused(paused: boolean): void {
  ui.paused = paused;
  viewportRef?.engine.setPaused(paused);
}

export function setSimulationTime(tdb: number): void {
  viewportRef?.engine.setTime(tdb);
}

/** The core's current date, in TDB Julian date. */
export function simulationTime(): number {
  return viewportRef?.engine.getTime() ?? 0;
}

export const CLASSIFICATION_ORDER: Array<[BodyClassification, string]> = [
  [BodyClassification.Planet, 'Planets'],
  [BodyClassification.DwarfPlanet, 'Dwarf planets'],
  [BodyClassification.Moon, 'Moons'],
  [BodyClassification.MinorMoon, 'Minor moons'],
  [BodyClassification.Asteroid, 'Asteroids'],
  [BodyClassification.Comet, 'Comets'],
  [BodyClassification.Spacecraft, 'Spacecraft'],
];

// --------------------------------------------------------------- bookmarks

let bookmarkCounter = 0;
export function nextBookmarkId(): string {
  bookmarkCounter += 1;
  return `bm-${bookmarkCounter}`;
}

export const bookmarks = reactive<{ menu: BookmarkFolder[]; toolbar: BookmarkFolder[] }>({
  menu: [
    {
      id: 'menu-root',
      title: 'Bookmarks',
      description: '',
      folded: false,
      children: [
        {
          kind: 'folder',
          folder: {
            id: 'menu-solarsystem',
            title: 'Solar System',
            description: 'Planets and moons',
            folded: false,
            children: [],
          },
        },
      ],
    },
  ],
  toolbar: [
    {
      id: 'toolbar-root',
      title: 'Bookmark toolbar',
      description: '',
      folded: false,
      children: [
        {
          kind: 'bookmark',
          id: 'toolbar-earth',
          title: 'Earth',
          description: 'View of Earth',
          url: 'cel://Follow/Sol:Earth',
        },
        {
          kind: 'bookmark',
          id: 'toolbar-saturn',
          title: 'Saturn',
          description: 'View of Saturn',
          url: 'cel://Follow/Sol:Saturn',
        },
      ],
    },
  ],
});

export { RenderFlags, RenderLabels, StarStyle, TextureResolution, HudDetail, DateFormat };
export const EMPTY_VEC = vec3(0, 0, 0);
