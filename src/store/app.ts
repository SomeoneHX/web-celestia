// Application state.
//
// The simulation, observer and renderer are large mutable objects that change
// every frame, so they are deliberately kept outside Vue's reactivity graph. The
// reactive part of this module mirrors the settings the shell reads and writes,
// and pushes changes down to the engine through explicit actions.

import { reactive, shallowRef, triggerRef } from 'vue';
import { Universe } from '@/core/universe';
import { Simulation, RenderFlags, RenderLabels, StarStyle, TextureResolution, HudDetail, DateFormat } from '@/core/simulation';
import { Observer } from '@/core/observer';
import { Selection } from '@/core/selection';
import { MarkerStore } from '@/core/markers';
import type { CelestiaCoreHandle } from '@/engine/celestiaCore';
import { setStarColorTable, getStarColorTable, type StarColorTable } from '@/render/starcolor';
import { BodyClassification, type Body } from '@/core/body';
import type { Star } from '@/core/star';
import type { DeepSkyObject } from '@/core/dso';
import type { Location } from '@/core/locations';
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
  showFPS: boolean;
  lightDelayActive: boolean;

  // Time control.
  timeScale: number;
  paused: boolean;

  // Selection mirror, refreshed when the selection changes.
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

type Engine = {
  universe: Universe;
  simulation: Simulation;
  observer: Observer;
  markers: MarkerStore;
};

const engineRef = shallowRef<Engine | null>(null);

/**
 * The WebAssembly viewport.
 *
 * The shell's own engine still supplies the panels and the lists, but the scene
 * is drawn by Celestia's compiled engine, so every display setting has to reach
 * both. Registering the handle here keeps that in one place instead of each
 * component reaching for it.
 */
let viewportRef: CelestiaCoreHandle | null = null;

export function setCore(core: CelestiaCoreHandle | null): void {
  viewportRef = core;
}

export function viewport(): CelestiaCoreHandle | null {
  return viewportRef;
}

export function setEngine(engine: Engine): void {
  engineRef.value = engine;
  syncFromEngine();
}

export function engine(): Engine {
  const value = engineRef.value;
  if (!value) throw new Error('the engine has not been created yet');
  return value;
}

export function universeOrNull(): Universe | null {
  return engineRef.value?.universe ?? null;
}

export const ui = reactive<UiState>({
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
  showFPS: false,
  lightDelayActive: false,

  timeScale: 1,
  paused: false,

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
export function syncFromEngine(): void {
  const e = engineRef.value;
  if (!e) return;
  const s = e.simulation;
  ui.renderFlags = s.getRenderFlags();
  ui.labelMode = s.getLabelMode();
  ui.orbitMask = s.getOrbitMask();
  ui.starStyle = s.starStyle;
  ui.resolution = s.resolution;
  ui.measurementSystem = s.measurementSystem;
  ui.starColorTable = getStarColorTable();
  ui.faintestVisible = s.faintestVisible;
  ui.autoMag = s.autoMag;
  ui.faintestAM45deg = s.faintestAutoMag45Deg;
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
  ui.hudDetail = s.hudDetail;
  ui.timeZoneBias = s.timeZoneBias;
  ui.dateFormat = s.dateFormat;
  ui.showFPS = s.showFPSCounter;
  ui.timeScale = s.getTimeScale();
  ui.paused = s.getPauseState();
  triggerRef(engineRef);
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
  const e = engineRef.value;
  if (e) e.simulation.setRenderFlags(flags);
  viewportRef?.engine.setRenderFlags(Number(flags));
}

export function hasLabel(flag: number): boolean {
  return (ui.labelMode & flag) !== 0;
}

export function setLabel(flag: number, enabled: boolean): void {
  ui.labelMode = enabled ? ui.labelMode | flag : ui.labelMode & ~flag;
  const e = engineRef.value;
  if (e) e.simulation.setLabelMode(ui.labelMode);
  viewportRef?.engine.setLabelMode(ui.labelMode);
}

export function toggleLabel(flag: number): void {
  setLabel(flag, !hasLabel(flag));
}

export function setOrbitClassification(flag: number, enabled: boolean): void {
  ui.orbitMask = enabled ? ui.orbitMask | flag : ui.orbitMask & ~flag;
  const e = engineRef.value;
  if (e) e.simulation.setOrbitMask(ui.orbitMask);
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

export function openDialog(name: string, payload: unknown = null): void {
  ui.openDialog = name;
  ui.dialogPayload = payload;
}

export function closeDialog(): void {
  ui.openDialog = null;
  ui.dialogPayload = null;
}

/**
 * The engine's own path for a shell selection.
 *
 * The shell's solar system and the engine's are separate catalogues, so the one
 * thing they share is Celestia's path syntax. The shell's bodies carry the same
 * names the engine resolves, in the same parent chain, so joining them gives a
 * path the engine accepts: "Sol", "Sol/Earth", "Sol/Earth/Moon".
 */
export function enginePathFor(selection: Selection): string | null {
  const body = selection.body;
  // A star's own name is its catalogue name; the engine resolves it as a path.
  if (body === null) return selection.star?.names?.n ?? null;

  const parts: string[] = [];
  for (let node: Body | null = body; node !== null; node = node.parent) parts.unshift(node.name);
  return parts.join('/');
}

/**
 * Selects a shell selection in the engine, so the two agree.
 *
 * The engine owns the selection: its HUD draws the information panel for
 * whatever it has selected, so a selection made only in the shell leaves the
 * viewport looking as if nothing was picked.
 */
export function selectEngineObject(selection: Selection | null): boolean {
  const view = viewportRef;
  if (view === null || selection === null) return false;
  const path = enginePathFor(selection) ?? selection.getName();
  return path !== null && path !== '' ? view.engine.selectObject(path) : false;
}

export function setSelection(selection: Selection | null): void {
  const e = engineRef.value;
  if (!e) return;
  if (selection) e.simulation.setSelection(selection);
  else e.simulation.clearSelection();

  // Push it to the engine too. When the selection came from the engine this
  // selects the same object again and changes nothing.
  selectEngineObject(selection);
  refreshSelectionMirror();
}

/** Refreshes the reactive copy of the current selection. */
export function refreshSelectionMirror(): void {
  const e = engineRef.value;
  if (!e) return;
  const selection = e.simulation.getSelection();
  ui.selectionKind = selection.kind;
  ui.selectionName = selection.getName();
}

export function applyStarStyle(style: StarStyle): void {
  ui.starStyle = style;
  const e = engineRef.value;
  if (e) e.simulation.starStyle = style;
  viewportRef?.engine.setStarStyle(style);
}

export function applyResolution(resolution: TextureResolution): void {
  ui.resolution = resolution;
  const e = engineRef.value;
  if (e) e.simulation.resolution = resolution;
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

// --------------------------------------------------------------- selection

export function selectionForBody(body: Body): Selection {
  return Selection.forBody(body);
}

export function selectionForStar(star: Star): Selection {
  return Selection.forStar(star);
}

export function selectionForDeepSky(dso: DeepSkyObject): Selection {
  return Selection.forDeepSky(dso);
}

export function selectionForLocation(location: Location): Selection {
  return Selection.forLocation(location);
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
