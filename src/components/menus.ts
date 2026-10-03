// The complete menu tree of the Qt shell, transcribed from CelestiaAppWindow's
// createMenus(), the CelestiaActions constructor and populateBookmarkMenu().
//
// Item order, labels, separators, check states and accelerators match the
// original so the shell behaves and reads the same way.

import { action, checkableAction, separator, submenu, ACCELERATORS, type QtMenuItem } from './qtMenuModel';
import { BodyClassification } from '@/core/body';
import {
  RenderFlags, RenderLabels, hasFlag, hasLabel, ui,
} from '@/store/app';

export interface MenuDefinition {
  id: string;
  label: string;
  items: QtMenuItem[];
}

function flagItem(id: string, label: string, flag: bigint, accelerator?: string): QtMenuItem {
  return checkableAction(id, label, hasFlag(flag), accelerator ? { accelerator } : {});
}

function labelItem(id: string, label: string): QtMenuItem {
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

function orbitItem(id: string, label: string, classification: number): QtMenuItem {
  return checkableAction(id, label, (ui.orbitMask & classification) !== 0);
}

export function buildMenus(bookmarkMenu: QtMenuItem[]): MenuDefinition[] {
  const fileMenu: QtMenuItem[] = [
    action('file-grab-image', '&Grab image', { icon: 'grab-image.png', accelerator: ACCELERATORS.grabImage }),
    action('file-capture-video', 'Capture &video', { icon: 'capture-video.png', accelerator: ACCELERATORS.captureVideo }),
    action('file-copy-image', '&Copy image', { icon: 'picture_copy.png', accelerator: ACCELERATORS.copyImage }),
    separator(),
    action('file-open-script', '&Open Script...', { icon: 'script2.png' }),
    submenu('Scripts', ui.scripts.length
      ? ui.scripts.map((s) => action(`script:${s.path}`, s.title))
      : [action('scripts-empty', '(none found)', { disabled: true })]),
    separator(),
    action('file-preferences', '&Preferences...', { icon: 'preferences.png' }),
    action('file-exit', 'E&xit', { icon: 'exit.png', accelerator: ACCELERATORS.exit }),
  ];

  const navigationMenu: QtMenuItem[] = [
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

  const timeMenu: QtMenuItem[] = [
    action('time-set', 'Set &time', { icon: 'set-time.png' }),
    checkableAction('time-light-delay', 'Light Time Delay', ui.lightDelayActive),
  ];

  const displayMenu: QtMenuItem[] = [
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
      checkableAction('fps-auto', 'Auto', ui.fps === 0),
      checkableAction('fps-15', '15', false),
      checkableAction('fps-30', '30', false),
      checkableAction('fps-60', '60', false),
      checkableAction('fps-120', '120', false),
      checkableAction('fps-custom', 'Custom', false, { accelerator: ACCELERATORS.customFps }),
    ]),
  ];

  const viewMenu: QtMenuItem[] = [
    checkableAction('view-time-toolbar', 'Time', ui.showTimeToolBar),
    checkableAction('view-guides-toolbar', 'Guides', ui.showGuidesToolBar),
    checkableAction('view-bookmark-toolbar', 'Bookmark Toolbar', ui.showBookmarkToolBar),
    separator(),
    checkableAction('view-celestial-browser', 'Celestial Browser', ui.showCelestialBrowser),
    checkableAction('view-info-browser', 'Info Browser', ui.showInfoBrowser),
    checkableAction('view-event-finder', 'Event Finder', ui.showEventFinder),
    separator(),
    checkableAction('view-full-screen', 'Full screen', ui.fullScreen, { accelerator: ACCELERATORS.fullScreen }),
  ];

  const multiViewMenu: QtMenuItem[] = [
    action('mv-split-vertical', 'Split view &vertically', { accelerator: ACCELERATORS.splitVertical }),
    action('mv-split-horizontal', 'Split view &horizontally', { accelerator: ACCELERATORS.splitHorizontal }),
    action('mv-cycle', 'Cycle views', { accelerator: ACCELERATORS.cycleView }),
    action('mv-single', 'Single view', { accelerator: ACCELERATORS.singleView }),
    action('mv-delete', 'Delete view', { accelerator: ACCELERATORS.deleteView }),
    separator(),
    checkableAction('mv-frames-visible', 'Frames visible', true),
    checkableAction('mv-active-frame-visible', 'Active frame visible', true),
    checkableAction('mv-sync-time', 'Synchronize time', true),
  ];

  const helpMenu: QtMenuItem[] = [
    action('help-guide', 'Celestia Guide', { icon: 'book.png' }),
    action('help-wiki', 'Celestia Wiki', { icon: 'book.png' }),
    separator(),
    action('help-gl-info', 'OpenGL Info', { icon: 'report_GL.png' }),
    action('help-about', 'About Celestia', { icon: 'about.png' }),
  ];

  return [
    { id: 'file', label: '&File', items: fileMenu },
    { id: 'navigation', label: '&Navigation', items: navigationMenu },
    { id: 'time', label: '&Time', items: timeMenu },
    { id: 'display', label: '&Display', items: displayMenu },
    { id: 'bookmarks', label: '&Bookmarks', items: bookmarkMenu },
    { id: 'view', label: '&View', items: viewMenu },
    { id: 'multiview', label: '&MultiView', items: multiViewMenu },
    { id: 'help', label: '&Help', items: helpMenu },
  ];
}

/** Body classification masks used by the orbit submenus. */
export const ORBIT_CLASSIFICATIONS = {
  'orbit-stars': BodyClassification.Planet,
  'orbit-planets': BodyClassification.Planet,
  'orbit-dwarf-planets': BodyClassification.DwarfPlanet,
  'orbit-moons': BodyClassification.Moon,
  'orbit-minor-moons': BodyClassification.MinorMoon,
  'orbit-asteroids': BodyClassification.Asteroid,
  'orbit-comets': BodyClassification.Comet,
  'orbit-spacecraft': BodyClassification.Spacecraft,
} as const;

export function buildOrbitsSubmenu(): QtMenuItem {
  return submenu('&Orbits', [
    orbitItem('orbit-stars', 'Stars', 0x100),
    orbitItem('orbit-planets', 'Planets', BodyClassification.Planet),
    orbitItem('orbit-dwarf-planets', 'Dwarf Planets', BodyClassification.DwarfPlanet),
    orbitItem('orbit-moons', 'Moons', BodyClassification.Moon),
    orbitItem('orbit-minor-moons', 'Minor Moons', BodyClassification.MinorMoon),
    orbitItem('orbit-asteroids', 'Asteroids', BodyClassification.Asteroid),
    orbitItem('orbit-comets', 'Comets', BodyClassification.Comet),
    orbitItem('orbit-spacecraft', 'Spacecraft', BodyClassification.Spacecraft),
  ]);
}

export function buildLabelsSubmenu(): QtMenuItem {
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
