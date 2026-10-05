// The complete menu tree of the Qt shell, transcribed from CelestiaAppWindow's
// createMenus(), the CelestiaActions constructor and populateBookmarkMenu().
//
// Item order, labels, separators, check states and accelerators match the
// original so the shell behaves and reads the same way.

import { action, checkableAction, separator, submenu, ACCELERATORS, type MenuItem } from './menuModel';
import { BodyClassification } from '@/core/celestia';
import {
  RenderFlags, RenderLabels, hasFlag, hasLabel, t, tc, ui,
  viewport,
} from '@/store/app';

export interface MenuDefinition {
  id: string;
  label: string;
  items: MenuItem[];
}

function flagItem(id: string, label: string, flag: bigint, accelerator?: string): MenuItem {
  return checkableAction(id, label, hasFlag(flag), accelerator ? { accelerator } : {});
}

function labelItem(id: string, label: string): MenuItem {
  const map: Record<string, number> = {
    'label-stars': RenderLabels.StarLabels,
    'label-planets': RenderLabels.PlanetLabels,
    'label-dwarf-planets': RenderLabels.DwarfPlanetLabels,
    'label-moons': RenderLabels.MoonLabels,
    'label-minor-moons': RenderLabels.MinorMoonLabels,
    'label-asteroids': RenderLabels.AsteroidLabels,
    'label-comets': RenderLabels.CometLabels,
    'label-spacecraft': RenderLabels.SpacecraftLabels,
    'label-galaxies': RenderLabels.GalaxyLabels,
    'label-globulars': RenderLabels.GlobularLabels,
    'label-open-clusters': RenderLabels.OpenClusterLabels,
    'label-nebulae': RenderLabels.NebulaLabels,
    'label-locations': RenderLabels.LocationLabels,
    'label-constellations': RenderLabels.ConstellationLabels,
  };
  return checkableAction(id, label, hasLabel(map[id] ?? 0));
}

function orbitItem(id: string, label: string, classification: number): MenuItem {
  return checkableAction(id, label, (ui.orbitMask & classification) !== 0);
}

/** The rates Qt's FPSActionGroup offers, in its order. */
const FPS_RATES = [0, 15, 30, 60, 120];

/**
 * One entry of the FPS control, which Qt builds from that array: the rate's own
 * number, or Auto for zero, and checked when it is the rate in effect.
 */
function fpsItem(id: string, label: string, value: number): MenuItem {
  return {
    kind: 'action',
    id,
    label: value === 0 ? tc('fps', label) : label,
    checkable: true,
    checked: ui.fps === value,
  };
}

export function buildMenus(bookmarkMenu: MenuItem[]): MenuDefinition[] {
  const fileMenu: MenuItem[] = [
    action('file-grab-image', '&Grab image', { icon: 'grab-image.png', accelerator: ACCELERATORS.grabImage }),
    action('file-capture-video', 'Capture &video', { icon: 'capture-video.png', accelerator: ACCELERATORS.captureVideo }),
    action('file-copy-image', '&Copy image', { icon: 'picture_copy.png', accelerator: ACCELERATORS.copyImage }),
    separator(),
    action('file-open-script', '&Open Script...', { icon: 'script2.png' }),
    // The scripts menu is left out altogether when the scan finds none, as Qt
    // leaves it out when its buildScriptsMenu returns nothing.
    ...(ui.scripts.length
      ? [submenu('Scripts', ui.scripts.map((s) => action(`script:${s.path}`, s.title)))]
      : []),
    // And this only when the config names a demo script, in a group of its own.
    ...(viewport()?.engine.demoScript() ? [separator(), action('file-run-demo', 'Run &Demo', { icon: 'script2.png' })] : []),
    separator(),
    action('file-preferences', '&Preferences...', { icon: 'preferences.png' }),
    action('file-exit', 'E&xit', { icon: 'exit.png', accelerator: ACCELERATORS.exit }),
  ];

  const navigationMenu: MenuItem[] = [
    action('nav-select-sun', 'Select Sun', { icon: 'select_sol.png' }),
    action('nav-center', 'Center Selection', { icon: 'center-obj.png' }),
    action('nav-goto', 'Goto Selection', { icon: 'go-jump.png' }),
    action('nav-goto-object', 'Goto Object...', { icon: 'go-jump.png' }),
    separator(),
    action('nav-tour', 'Tour Guide', { icon: 'tour.png' }),
    separator(),
    action('nav-copy-url', 'Copy URL / console text', { icon: 'clip_copy.png', accelerator: ACCELERATORS.copyUrl }),
    action('nav-paste-url', 'Paste URL / console text', { icon: 'clip_paste.png', accelerator: ACCELERATORS.pasteUrl }),
  ];

  const timeMenu: MenuItem[] = [
    action('time-set', 'Set &time', { icon: 'set-time.png' }),
    checkableAction('time-light-delay', 'Light Time Delay', ui.lightDelayActive),
  ];

  const displayMenu: MenuItem[] = [
    flagItem('display-atmospheres', 'Atmospheres', RenderFlags.ShowAtmospheres, ACCELERATORS.atmospheres),
    flagItem('display-clouds', 'Clouds', RenderFlags.ShowCloudMaps),
    flagItem('display-comet-tails', 'Comet Tails', RenderFlags.ShowCometTails),
    flagItem('display-night-lights', 'Night Side Lights', RenderFlags.ShowNightMaps, ACCELERATORS.nightSideLights),
    submenu('Dee&p Sky Objects', [
      flagItem('display-galaxies', 'Galaxies', RenderFlags.ShowGalaxies),
      flagItem('display-globulars', 'Globulars', RenderFlags.ShowGlobulars),
      flagItem('display-open-clusters', 'Open Clusters', RenderFlags.ShowOpenClusters),
      flagItem('display-nebulae', 'Nebulae', RenderFlags.ShowNebulae, ACCELERATORS.nebulae),
    ]),
    submenu('&Shadows', [
      flagItem('display-ring-shadows', 'Ring Shadows', RenderFlags.ShowRingShadows),
      flagItem('display-eclipse-shadows', 'Eclipse Shadows', RenderFlags.ShowEclipseShadows, ACCELERATORS.eclipseShadows),
      flagItem('display-cloud-shadows', 'Cloud Shadows', RenderFlags.ShowCloudShadows),
    ]),
    separator(),
    action('display-more-stars', 'More Stars Visible', { accelerator: ACCELERATORS.moreStars }),
    action('display-fewer-stars', 'Fewer Stars Visible', { accelerator: ACCELERATORS.fewerStars }),
    flagItem('display-auto-magnitude', 'Auto Magnitude', RenderFlags.ShowAutoMag, ACCELERATORS.autoMagnitude),
    submenu('Star St&yle', [
      checkableAction('star-style-points', 'Points', ui.starStyle === 1),
      checkableAction('star-style-fuzzy', 'Fuzzy Points', ui.starStyle === 0),
      checkableAction('star-style-scaled', 'Scaled Discs', ui.starStyle === 2),
      checkableAction('star-style-psf', 'Point Spread Function', ui.starStyle === 3),
    ]),
    separator(),
    submenu('Texture &Resolution', [
      checkableAction('resolution-low', 'Low', ui.resolution === 0),
      checkableAction('resolution-medium', 'Medium', ui.resolution === 1),
      checkableAction('resolution-high', 'High', ui.resolution === 2),
    ]),
    submenu('&FPS control', [
      fpsItem('fps-auto', 'Auto', 0),
      fpsItem('fps-15', '15', 15),
      fpsItem('fps-30', '30', 30),
      fpsItem('fps-60', '60', 60),
      fpsItem('fps-120', '120', 120),
      // Checked for a rate that is not one of the five, which is what Qt's
      // FPSActionGroup::updateFPS does.
      action('fps-custom', tc('fps', 'Custom'), { checkable: true, checked: FPS_RATES.indexOf(ui.fps) < 0, accelerator: ACCELERATORS.customFps }),
    ]),
  ];

  const viewMenu: MenuItem[] = [
    checkableAction('view-time-toolbar', 'Time', ui.showTimeToolBar),
    checkableAction('view-guides-toolbar', 'Guides', ui.showGuidesToolBar),
    checkableAction('view-bookmark-toolbar', 'Bookmarks', ui.showBookmarkToolBar),
    separator(),
    checkableAction('view-celestial-browser', 'Celestial Browser', ui.showCelestialBrowser),
    checkableAction('view-info-browser', 'Info Browser', ui.showInfoBrowser),
    checkableAction('view-event-finder', 'Event Finder', ui.showEventFinder),
    separator(),
    // The shell's own entry: Qt has no colour mode, taking the platform's
    // palette instead, so this is the one piece of the menu with no counterpart
    // in the front end it is a port of.
    submenu('&Theme', [
      checkableAction('theme-system', 'System', ui.colorMode === 'system'),
      checkableAction('theme-light', 'Light', ui.colorMode === 'light'),
      checkableAction('theme-dark', 'Dark', ui.colorMode === 'dark'),
    ]),
    separator(),
    checkableAction('view-full-screen', 'Full screen', ui.fullScreen, { accelerator: ACCELERATORS.fullScreen }),
  ];

  // The five view commands go to CelestiaCore::charEntered, which is where the
  // Qt slots send them too, so nothing here decides what a split does.
  const multiViewMenu: MenuItem[] = [
    action('mv-split-vertical', 'Split view vertically', { icon: 'split-vert.png', accelerator: ACCELERATORS.splitVertical }),
    action('mv-split-horizontal', 'Split view horizontally', { icon: 'split-horiz.png', accelerator: ACCELERATORS.splitHorizontal }),
    action('mv-cycle', 'Cycle views', { icon: 'split-cycle.png', accelerator: ACCELERATORS.cycleView }),
    action('mv-single', 'Single view', { icon: 'split-single.png', accelerator: ACCELERATORS.singleView }),
    action('mv-delete', 'Delete view', { icon: 'split-delete.png', accelerator: ACCELERATORS.deleteView }),
    separator(),
    checkableAction('mv-frames-visible', 'Frames visible', ui.framesVisible),
    checkableAction('mv-active-frame-visible', 'Active frame visible', ui.activeFrameVisible),
    checkableAction('mv-sync-time', 'Synchronize time', ui.syncTime),
  ];

  const helpMenu: MenuItem[] = [
    action('help-guide', 'Celestia Guide', { icon: 'book.png' }),
    action('help-wiki', 'Celestia Wiki', { icon: 'book.png' }),
    separator(),
    action('help-gl-info', 'OpenGL Info', { icon: 'report_GL.png' }),
    action('help-about', 'About Celestia', { icon: 'about.png' }),
  ];

  return [
    { id: 'file', label: t('&File'), items: fileMenu },
    { id: 'navigation', label: t('&Navigation'), items: navigationMenu },
    { id: 'time', label: t('&Time'), items: timeMenu },
    { id: 'display', label: t('&Display'), items: displayMenu },
    { id: 'bookmarks', label: t('&Bookmarks'), items: bookmarkMenu },
    { id: 'view', label: t('&View'), items: viewMenu },
    { id: 'multiview', label: t('&MultiView'), items: multiViewMenu },
    { id: 'help', label: t('&Help'), items: helpMenu },
  ];
}

/** Body classification masks used by the orbit submenus. */
export const ORBIT_CLASSIFICATIONS = {
  'orbit-stars': BodyClassification.Stellar,
  'orbit-planets': BodyClassification.Planet,
  'orbit-dwarf-planets': BodyClassification.DwarfPlanet,
  'orbit-moons': BodyClassification.Moon,
  'orbit-minor-moons': BodyClassification.MinorMoon,
  'orbit-asteroids': BodyClassification.Asteroid,
  'orbit-comets': BodyClassification.Comet,
  'orbit-spacecraft': BodyClassification.Spacecraft,
} as const;

export function buildOrbitsSubmenu(): MenuItem {
  return submenu('&Orbits', [
    orbitItem('orbit-stars', 'Stars', BodyClassification.Stellar),
    orbitItem('orbit-planets', 'Planets', BodyClassification.Planet),
    orbitItem('orbit-dwarf-planets', 'Dwarf Planets', BodyClassification.DwarfPlanet),
    orbitItem('orbit-moons', 'Moons', BodyClassification.Moon),
    orbitItem('orbit-minor-moons', 'Minor Moons', BodyClassification.MinorMoon),
    orbitItem('orbit-asteroids', 'Asteroids', BodyClassification.Asteroid),
    orbitItem('orbit-comets', 'Comets', BodyClassification.Comet),
    orbitItem('orbit-spacecraft', 'Spacecraft', BodyClassification.Spacecraft),
  ]);
}

export function buildLabelsSubmenu(): MenuItem {
  return submenu('&Labels', [
    labelItem('label-stars', 'Stars'),
    labelItem('label-planets', 'Planets'),
    labelItem('label-dwarf-planets', 'Dwarf Planets'),
    labelItem('label-moons', 'Moons'),
    labelItem('label-minor-moons', 'Minor Moons'),
    labelItem('label-asteroids', 'Asteroids'),
    labelItem('label-comets', 'Comets'),
    labelItem('label-spacecraft', 'Spacecraft'),
    labelItem('label-galaxies', 'Galaxies'),
    labelItem('label-globulars', 'Globulars'),
    labelItem('label-open-clusters', 'Open clusters'),
    labelItem('label-nebulae', 'Nebulae'),
    labelItem('label-locations', 'Locations'),
    labelItem('label-constellations', 'Constellations'),
  ]);
}
