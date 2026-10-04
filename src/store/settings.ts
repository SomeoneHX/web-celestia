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
  atmosphereSegmentCount: number;
  cloudSegmentCount: number;
  separateRayleighMieScaleHeights: boolean;
  toneMappingMode: number;
  toneMappingExposure: number;
  locationFilter: string;
  lightDelayActive: boolean;

  // The core's own display settings.
  hudDetail: number;
  dateFormat: number;
  timeZoneBias: number;

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
    atmosphereSegmentCount: settings?.atmosphereSegmentCount ?? 0,
    cloudSegmentCount: settings?.cloudSegmentCount ?? 0,
    separateRayleighMieScaleHeights: settings?.separateRayleighMieScaleHeights ?? false,
    toneMappingMode: settings?.toneMappingMode ?? 0,
    toneMappingExposure: settings?.toneMappingExposure ?? 1,
    locationFilter: engine?.locationFilter() ?? '0',
    lightDelayActive: engine?.lightDelayActive() ?? false,
    hudDetail: settings?.hudDetail ?? 0,
    dateFormat: settings?.dateFormat ?? 0,
    timeZoneBias: settings?.timeZoneBias ?? 0,
    showTimeToolBar: ui.showTimeToolBar,
    showGuidesToolBar: ui.showGuidesToolBar,
    showBookmarkToolBar: ui.showBookmarkToolBar,
    showCelestialBrowser: ui.showCelestialBrowser,
    showInfoBrowser: ui.showInfoBrowser,
    showEventFinder: ui.showEventFinder,
    fps: ui.fps,
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
}
