// Settings across sessions, which is what QSettings is in the Qt front end.
//
// CelestiaAppWindow::readSettings restores the renderer's state, the observer's
// filters, the HUD's detail and the window's layout when it starts, and
// saveSettings writes them back when it closes; the bookmarks go in a file of
// their own, named by celestia.cfg's FavoritesFile. The web build has no such
// place of its own, so this keeps the same set in local storage.
//
// Two things differ from the original, both because of the browser. The window's
// size and position are not stored: a tab has no say in them. Full screen is not
// restored either -- a browser will only enter full screen from a user gesture,
// so remembering it would mean coming back to a window that claims to be full
// screen and is not.
//
// The keys are the original's where it has one, so the two can be read side by
// side. The version is the analogue of CELESTIA_MAIN_WINDOW_VERSION, and a stored
// blob from another version is discarded rather than guessed at.

import type { CelestiaCoreHandle } from '@/engine/celestiaCore';
// Type only, so it is erased and the settings module does not depend on the
// store at runtime.
import type { ColorMode } from './app';

/** The key the settings are kept under, per origin. */
const STORAGE_KEY = 'celestia.settings';

/** Bumped when the shape below changes; older blobs are then ignored. */
const STORAGE_VERSION = 1;

export interface StoredSettings {
  version: number;

  // Renderer, from CelestiaAppWindow::saveSettings.
  renderFlags: string;
  labelMode: number;
  orbitMask: number;
  starStyle: number;
  resolution: number;
  starColorTable: number;
  ambientLightLevel: number;
  tintSaturation: number;
  faintestVisible: number;

  /**
   * The values under Preferences > Point spread function options, and the sRGB
   * override beside them. Qt stores the override in QSettings of its own because
   * there it is an attribute of the GL context rather than a renderer value.
   */
  starPointRadius?: number;
  starOptimization?: number;
  starMaxIrradiance?: number;
  starDimClipFactor?: number;
  starExposure?: number;
  sRGBRendering?: number;
  atmosphereSegmentCount: number;
  cloudSegmentCount: number;
  separateRayleighMieScaleHeights: boolean;
  toneMappingMode: number;
  toneMappingExposure: number;
  locationFilter: string;
  lightDelayActive: boolean;

  /** Whether the observer showed the limit of knowledge surface. */
  limitOfKnowledge?: boolean;

  // The core's own display settings.
  hudDetail: number;
  dateFormat: number;
  timeZoneBias: number;

  /**
   * MultiView's three toggles, which Qt keeps in its Preferences group under
   * these names. A blob from before they were written has none of them.
   */
  framesVisible?: boolean;
  activeFrameVisible?: boolean;
  syncTime?: boolean;

  // What the View menu and the tool bars show, which Qt restores through the
  // window state blob.
  showTimeToolBar: boolean;
  showGuidesToolBar: boolean;
  showBookmarkToolBar: boolean;
  showCelestialBrowser: boolean;
  showInfoBrowser: boolean;
  showEventFinder: boolean;

  /** QSettings' "fps", which is the frame rate ceil. */
  fps: number;

  /**
   * The window's colour mode. Qt keeps none: it takes the platform's palette, so
   * this is the shell's own and a blob written before it existed leaves it out.
   */
  colorMode?: ColorMode;

  /** Celestia's bookmarks, which it keeps in FavoritesFile. */
  bookmarks: {
    menu: unknown[];
    toolbar: unknown[];
  };
}

/** What was stored, or null when there is nothing usable. */
export function loadSettings(): StoredSettings | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be denied outright, in which case there is nothing to restore
    // and saving will fail quietly too.
    return null;
  }

  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    if (parsed.version !== STORAGE_VERSION) return null;
    return parsed as StoredSettings;
  } catch {
    return null;
  }
}

export function saveSettings(settings: StoredSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A full or forbidden store is not worth interrupting the session for.
  }
}

/**
 * Writes the stored values into the engine.
 *
 * Everything goes through the engine rather than into the shell's own copy,
 * because the engine is what draws: setting the shell's flags without telling it
 * was a bug once already, and the reverse -- restoring the shell's defaults over
 * the engine's -- is what made the Sun lose its glow.
 *
 * The star colour table is the one setting the front end owns rather than the
 * engine: it is a table of colours the shell hands to the renderer, so it is
 * applied beside this call instead.
 */
export function applyStoredSettings(engine: CelestiaCoreHandle['engine'], stored: StoredSettings): void {
  // A flag set of zero is treated as "nothing was stored" rather than applied.
  // Nothing is drawn at all without stars, planets and the rest of the default
  // set, so no session ever leaves that value behind; a stored one means the blob
  // was written from an engine that was not up yet, and applying it would leave
  // the window black with no way back but clearing the site's storage.
  const flags = BigInt(stored.renderFlags);
  if (flags !== 0n) engine.setRenderFlags(Number(flags));
  engine.setLabelMode(stored.labelMode);
  engine.setOrbitMask(stored.orbitMask);
  engine.setStarStyle(stored.starStyle);
  engine.setResolution(stored.resolution);
  engine.setAmbientLightLevel(stored.ambientLightLevel);
  engine.setTintSaturation(stored.tintSaturation);
  engine.setFaintestVisible(stored.faintestVisible);
  engine.setAtmosphereSegmentCount(stored.atmosphereSegmentCount);
  engine.setCloudSegmentCount(stored.cloudSegmentCount);
  engine.setSeparateRayleighMieScaleHeights(stored.separateRayleighMieScaleHeights);
  engine.setToneMappingMode(stored.toneMappingMode);
  engine.setToneMappingExposure(stored.toneMappingExposure);
  engine.setLocationFilter(stored.locationFilter);
  engine.setLightDelayActive(stored.lightDelayActive);
  engine.setHudDetail(stored.hudDetail);
  engine.setDateFormat(stored.dateFormat);
  engine.setTimeZoneBias(stored.timeZoneBias);

  // A stored blob that predates these leaves them out, and then the core's own
  // defaults stand rather than the shell inventing one -- which is what Qt does
  // when its Preferences group has no key for them.
  if (typeof stored.framesVisible === 'boolean') engine.setFramesVisible(stored.framesVisible);
  if (typeof stored.activeFrameVisible === 'boolean') engine.setActiveFrameVisible(stored.activeFrameVisible);
  if (typeof stored.syncTime === 'boolean') engine.setSyncTime(stored.syncTime);

  // The star values fall back the same way: each one's default is the value
  // celestia.cfg gave the renderer, so an absent key leaves it alone.
  if (typeof stored.starPointRadius === 'number') engine.setStarPointRadius(stored.starPointRadius);
  if (typeof stored.starOptimization === 'number') engine.setStarOptimization(stored.starOptimization);
  if (typeof stored.starMaxIrradiance === 'number') engine.setStarMaxIrradiance(stored.starMaxIrradiance);
  if (typeof stored.starDimClipFactor === 'number') engine.setStarDimClipFactor(stored.starDimClipFactor);
  if (typeof stored.starExposure === 'number') engine.setStarExposure(stored.starExposure);

  // Qt stores a flag rather than the surface's name, and setting it is what the
  // flag means; the observer keeps whatever celestia.cfg gave it otherwise.
  if (stored.limitOfKnowledge === true) engine.setDisplayedSurface('limit of knowledge');
}

export { STORAGE_VERSION };

/**
 * The settings as they stand, ready to store.
 *
 * Read back out of the engine rather than out of the shell's copy, for the same
 * reason they are written into it.
 */
export function captureSettings(engine: CelestiaCoreHandle['engine'] | null, ui: CapturedUi, bookmarks: StoredSettings['bookmarks']): StoredSettings {
  const settings = engine?.settings();

  return {
    version: STORAGE_VERSION,
    renderFlags: String(settings?.renderFlags ?? 0),
    labelMode: settings?.labelMode ?? 0,
    orbitMask: settings?.orbitMask ?? 0,
    starStyle: settings?.starStyle ?? 0,
    resolution: settings?.resolution ?? 0,
    starColorTable: settings?.starColorTable ?? 0,
    ambientLightLevel: settings?.ambientLightLevel ?? 0,
    tintSaturation: settings?.tintSaturation ?? 1,
    faintestVisible: settings?.faintestVisible ?? 6.5,
    starPointRadius: settings?.starPointRadius ?? 1.5,
    starOptimization: settings?.starOptimization ?? 0.1,
    starMaxIrradiance: settings?.starMaxIrradiance ?? 100,
    starDimClipFactor: settings?.starDimClipFactor ?? 10,
    starExposure: settings?.starExposure ?? 1,
    sRGBRendering: ui.sRGBRendering,
    atmosphereSegmentCount: settings?.atmosphereSegmentCount ?? 0,
    cloudSegmentCount: settings?.cloudSegmentCount ?? 0,
    separateRayleighMieScaleHeights: settings?.separateRayleighMieScaleHeights ?? false,
    toneMappingMode: settings?.toneMappingMode ?? 0,
    toneMappingExposure: settings?.toneMappingExposure ?? 1,
    locationFilter: engine?.locationFilter() ?? '0',
    lightDelayActive: engine?.lightDelayActive() ?? false,
    limitOfKnowledge: engine?.displayedSurface() === 'limit of knowledge',
    hudDetail: settings?.hudDetail ?? 0,
    dateFormat: settings?.dateFormat ?? 0,
    timeZoneBias: settings?.timeZoneBias ?? 0,
    framesVisible: engine?.framesVisible() ?? true,
    activeFrameVisible: engine?.activeFrameVisible() ?? false,
    syncTime: engine?.syncTime() ?? true,
    showTimeToolBar: ui.showTimeToolBar,
    showGuidesToolBar: ui.showGuidesToolBar,
    showBookmarkToolBar: ui.showBookmarkToolBar,
    showCelestialBrowser: ui.showCelestialBrowser,
    showInfoBrowser: ui.showInfoBrowser,
    showEventFinder: ui.showEventFinder,
    fps: ui.fps,
    colorMode: ui.colorMode,
    bookmarks,
  };
}

/** The parts of the shell's state that are stored. */
export interface CapturedUi {
  showTimeToolBar: boolean;
  showGuidesToolBar: boolean;
  showBookmarkToolBar: boolean;
  showCelestialBrowser: boolean;
  showInfoBrowser: boolean;
  showEventFinder: boolean;
  fps: number;
  /** The renderer holds no such value; the drop down is where it lives here. */
  sRGBRendering: number;
  /** Likewise the shell's own: Qt takes the platform's palette instead. */
  colorMode: ColorMode;
}
