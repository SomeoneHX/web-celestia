<script setup lang="ts">
// The main window: menu bar, tool bars, viewport, docks and dialog host.
//
// This is CelestiaAppWindow, the central widget of the Qt shell. The render loop,
// the HUD overlay, the mouse and keyboard bindings and the dock layout all live
// here; the heavier widgets are separate components.

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import QtMenu from './MenuBar.vue';
import ToolBars from './ToolBars.vue';
import EventFinder from './EventFinder.vue';
import InfoPanel from './InfoPanel.vue';
import BrowserDock from './BrowserDock.vue';
import SelectionPopup from './SelectionPopup.vue';
import DialogHost from './dialogs/DialogHost.vue';
import { buildMenus } from './menus';
import type { MenuItem } from './menuModel';
import {
  bookmarks, closeDialog, hasFlag, hasLabel, openDialog, setCore, setFlag, setLabel, setOrbitClassification,
  refreshSelectionMirror, setPaused, setTimeScale, showMessage, ui, applyStarStyle, applyResolution,
  applyStarColorTable, EMPTY_VEC,
  restoreSettings, storeSettings, storeSettingsNow,
} from '@/store/app';
import { BodyClassification, RenderFlags, RenderLabels, StarStyle, TextureResolution } from '@/core/celestia';
import { loadCelestiaCore, type CelestiaCoreHandle } from '@/engine/celestiaCore';
import type { SelectedObject } from '@/wasm/celestia_core.js';
import { buildInfoPage } from '@/core/objectInfo';
import { formatLocal } from '@/core/objectInfo';
import {
  chooseCaptureTarget, setCaptureSource, syncCaptureFromEngine,
} from '@/core/videoCapture';
import { vec3, degToRad, J2000, KM_PER_AU, KM_PER_LY, add, sub, length, normalize } from '@/core/math';
import { TDBtoUTC } from '@/core/astro';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);

let core: CelestiaCoreHandle | null = null;
let rafHandle = 0;
let lastFrame = 0;
let disposed = false;

// Mouse drag state, following the bindings in controls.txt.
const drag = { active: false, button: 0, lastX: 0, lastY: 0, moved: false };

// shallowRef keeps the class instance intact; ref() would deep-unwrap it and
// drop the private members of Body.
const popup = shallowRef<{ x: number; y: number; picked: SelectedObject } | null>(null);

// ------------------------------------------------------------------- menus

// Rebuilt when the core registers: the labels are translated through its
// catalogue, which does not exist until then.
const menus = computed(() => {
  void ui.engineGeneration;
  void ui.framesVisible;
  void ui.activeFrameVisible;
  void ui.syncTime;
  return buildMenus(bookmarkMenuItems());
});

function bookmarkMenuItems(): MenuItem[] {
  const items: MenuItem[] = [
    { kind: 'action', id: 'bookmark-add', label: 'Add Bookmark...', icon: 'bookmark-add.png' },
    { kind: 'action', id: 'bookmark-organize', label: 'Organize Bookmarks...', icon: 'application-bookmark.png' },
    { kind: 'separator' },
  ];
  walkBookmarks(bookmarks.menu, items);
  return items;
}

function walkBookmarks(folders: typeof bookmarks.menu, out: MenuItem[]): void {
  for (const folder of folders) {
    const children: MenuItem[] = [];
    for (const child of folder.children) {
      if (child.kind === 'separator') {
        children.push({ kind: 'separator' });
      } else if (child.kind === 'folder') {
        const nested: MenuItem[] = [];
        walkBookmarks([child.folder], nested);
        children.push({ kind: 'submenu', label: child.folder.title, items: nested });
      } else {
        children.push({ kind: 'action', id: `bookmark:${child.id}`, label: child.title });
      }
    }
    out.push({ kind: 'submenu', label: folder.title, items: children.length ? children : [{ kind: 'action', id: 'noop', label: '(empty)', disabled: true }] });
  }
}

function iconUrl(name: string): string {
  return `${import.meta.env.BASE_URL || '/'}icons/${name}`.replace(/\/{2,}/g, '/');
}

// ----------------------------------------------------------------- actions

async function onMenuAction(id: string): Promise<void> {
  if (id.startsWith('bookmark:')) {
    applyBookmark(id.slice('bookmark:'.length));
    return;
  }

  switch (id) {
    case 'bookmark-add':
      openDialog('add-bookmark');
      return;
    case 'bookmark-organize':
      openDialog('organize-bookmarks');
      return;
    default:
      break;
  }
  if (id.startsWith('script:')) {
    // Celestia's own interpreter runs it; the same call the Qt front end makes.
    const path = id.slice('script:'.length);
    core?.engine.runScript(path);
    showMessage(`Running ${path}`, 2);
    return;
  }

  switch (id) {
    case 'file-grab-image':
      grabImage();
      return;
    case 'file-capture-video':
      void slotCaptureVideo();
      return;
    case 'file-copy-image':
      copyImage();
      return;
    case 'file-open-script':
      openDialog('open-script');
      return;
    case 'file-run-demo': {
      // CelestiaAppWindow::slotRunDemo runs the script the config names.
      const demo = core?.engine.demoScript() ?? '';
      if (demo === '') return;
      core?.engine.runScript(demo);
      showMessage(`Running ${demo}`, 2);
      return;
    }
    case 'file-preferences':
      openDialog('preferences');
      return;
    case 'file-exit':
      showMessage('Close the browser tab to exit', 3);
      return;

    // The navigation actions are key bindings, exactly as they are in Celestia's
    // Qt front end: slotSelectSun is charEntered("h"), centerSelection "c" and
    // gotoSelection "g". The core owns both the selection and the camera, so
    // sending the key is the whole implementation.
    case 'nav-select-sun':
      core?.engine.charEntered('h', 0);
      refreshInfo();
      return;
    case 'nav-center':
      core?.engine.charEntered('c', 0);
      return;
    case 'nav-goto':
      core?.engine.charEntered('g', 0);
      return;
    case 'nav-goto-object':
      openDialog('goto-object');
      return;
    case 'nav-tour':
      openDialog('tour-guide');
      return;
    case 'nav-copy-url':
      await navigator.clipboard.writeText(buildCelUrl());
      showMessage('Copied URL to the clipboard', 2);
      return;
    case 'nav-paste-url':
      try {
        const text = await navigator.clipboard.readText();
        applyCelUrl(text);
      } catch {
        showMessage('Clipboard access was denied', 3);
      }
      return;

    case 'time-set':
      openDialog('set-time');
      return;
    case 'time-light-delay':
      ui.lightDelayActive = !ui.lightDelayActive;
      core?.engine.setLightDelayActive(ui.lightDelayActive);
      return;

    case 'display-atmospheres':
      toggleFlag(RenderFlags.ShowAtmospheres);
      return;
    case 'display-clouds':
      toggleFlag(RenderFlags.ShowCloudMaps);
      return;
    case 'display-comet-tails':
      toggleFlag(RenderFlags.ShowCometTails);
      return;
    case 'display-night-lights':
      toggleFlag(RenderFlags.ShowNightMaps);
      return;
    case 'display-galaxies':
      toggleFlag(RenderFlags.ShowGalaxies);
      return;
    case 'display-globulars':
      toggleFlag(RenderFlags.ShowGlobulars);
      return;
    case 'display-open-clusters':
      toggleFlag(RenderFlags.ShowOpenClusters);
      return;
    case 'display-nebulae':
      toggleFlag(RenderFlags.ShowNebulae);
      return;
    case 'display-ring-shadows':
      toggleFlag(RenderFlags.ShowRingShadows);
      return;
    case 'display-eclipse-shadows':
      toggleFlag(RenderFlags.ShowEclipseShadows);
      return;
    case 'display-cloud-shadows':
      toggleFlag(RenderFlags.ShowCloudShadows);
      return;
    case 'display-more-stars':
      core?.engine.charEntered(']', 0);
      showMessage('More stars', 2);
      return;
    case 'display-fewer-stars':
      core?.engine.charEntered('[', 0);
      showMessage('Fewer stars', 2);
      return;
    // Orbits and Labels, the two submenus the Guides tool bar hangs off O and L.
    // qtcelestiaactions.cpp gives each item a body classification or a label bit
    // and toggles it, which is all these do.
    case 'orbit-stars':
      setOrbitClassification(BodyClassification.Stellar, !hasOrbit(BodyClassification.Stellar));
      return;
    case 'orbit-planets':
      setOrbitClassification(BodyClassification.Planet, !hasOrbit(BodyClassification.Planet));
      return;
    case 'orbit-dwarf-planets':
      setOrbitClassification(BodyClassification.DwarfPlanet, !hasOrbit(BodyClassification.DwarfPlanet));
      return;
    case 'orbit-moons':
      setOrbitClassification(BodyClassification.Moon, !hasOrbit(BodyClassification.Moon));
      return;
    case 'orbit-minor-moons':
      setOrbitClassification(BodyClassification.MinorMoon, !hasOrbit(BodyClassification.MinorMoon));
      return;
    case 'orbit-asteroids':
      setOrbitClassification(BodyClassification.Asteroid, !hasOrbit(BodyClassification.Asteroid));
      return;
    case 'orbit-comets':
      setOrbitClassification(BodyClassification.Comet, !hasOrbit(BodyClassification.Comet));
      return;
    case 'orbit-spacecraft':
      setOrbitClassification(BodyClassification.Spacecraft, !hasOrbit(BodyClassification.Spacecraft));
      return;

    case 'label-stars':
      setLabel(RenderLabels.StarLabels, !hasLabel(RenderLabels.StarLabels));
      return;
    case 'label-planets':
      setLabel(RenderLabels.PlanetLabels, !hasLabel(RenderLabels.PlanetLabels));
      return;
    case 'label-dwarf-planets':
      setLabel(RenderLabels.DwarfPlanetLabels, !hasLabel(RenderLabels.DwarfPlanetLabels));
      return;
    case 'label-moons':
      setLabel(RenderLabels.MoonLabels, !hasLabel(RenderLabels.MoonLabels));
      return;
    case 'label-minor-moons':
      setLabel(RenderLabels.MinorMoonLabels, !hasLabel(RenderLabels.MinorMoonLabels));
      return;
    case 'label-asteroids':
      setLabel(RenderLabels.AsteroidLabels, !hasLabel(RenderLabels.AsteroidLabels));
      return;
    case 'label-comets':
      setLabel(RenderLabels.CometLabels, !hasLabel(RenderLabels.CometLabels));
      return;
    case 'label-spacecraft':
      setLabel(RenderLabels.SpacecraftLabels, !hasLabel(RenderLabels.SpacecraftLabels));
      return;
    case 'label-galaxies':
      setLabel(RenderLabels.GalaxyLabels, !hasLabel(RenderLabels.GalaxyLabels));
      return;
    case 'label-globulars':
      setLabel(RenderLabels.GlobularLabels, !hasLabel(RenderLabels.GlobularLabels));
      return;
    case 'label-open-clusters':
      setLabel(RenderLabels.OpenClusterLabels, !hasLabel(RenderLabels.OpenClusterLabels));
      return;
    case 'label-nebulae':
      setLabel(RenderLabels.NebulaLabels, !hasLabel(RenderLabels.NebulaLabels));
      return;
    case 'label-locations':
      setLabel(RenderLabels.LocationLabels, !hasLabel(RenderLabels.LocationLabels));
      return;
    case 'label-constellations':
      setLabel(RenderLabels.ConstellationLabels, !hasLabel(RenderLabels.ConstellationLabels));
      return;

    case 'display-auto-magnitude':
      // The flag is the engine's; the shell only mirrors it for the menu tick.
      toggleFlag(RenderFlags.ShowAutoMag);
      return;
    case 'star-style-points':
      applyStarStyle(StarStyle.PointStars);
      return;
    case 'star-style-fuzzy':
      applyStarStyle(StarStyle.FuzzyPointStars);
      return;
    case 'star-style-scaled':
      applyStarStyle(StarStyle.ScaledDiscStars);
      return;
    case 'star-style-psf':
      applyStarStyle(StarStyle.PointSpreadFunction);
      return;
    case 'resolution-low':
      applyResolution(TextureResolution.Low);
      return;
    case 'resolution-medium':
      applyResolution(TextureResolution.Medium);
      return;
    case 'resolution-high':
      applyResolution(TextureResolution.High);
      return;
    case 'fps-auto':
      ui.fps = 0;
      return;
    case 'fps-15':
      setFps(15);
      return;
    case 'fps-30':
      setFps(30);
      return;
    case 'fps-60':
      setFps(60);
      return;
    case 'fps-120':
      setFps(120);
      return;
    case 'fps-custom':
      openDialog('fps-custom');
      return;

    case 'view-time-toolbar':
      ui.showTimeToolBar = !ui.showTimeToolBar;
      return;
    case 'view-guides-toolbar':
      ui.showGuidesToolBar = !ui.showGuidesToolBar;
      return;
    case 'view-bookmark-toolbar':
      ui.showBookmarkToolBar = !ui.showBookmarkToolBar;
      return;
    case 'view-celestial-browser':
      ui.showCelestialBrowser = !ui.showCelestialBrowser;
      return;
    case 'view-info-browser':
      ui.showInfoBrowser = !ui.showInfoBrowser;
      return;
    case 'view-event-finder':
      ui.showEventFinder = !ui.showEventFinder;
      return;
    case 'view-full-screen':
      void toggleFullScreen();
      return;

    case 'mv-split-vertical':
    case 'mv-split-horizontal':
    case 'mv-cycle':
    case 'mv-single':
    case 'mv-delete':
      // The Qt slots send these control characters rather than calling the core
      // directly, because CelestiaCore::charEntered is where the whole view tree
      // is managed. The shell therefore has no view logic of its own: the core
      // draws every view into the one drawable and lays them out by rectangle.
      core?.engine.charEntered(MULTIVIEW_KEYS[id], 0);
      return;

    case 'mv-frames-visible':
      ui.framesVisible = !ui.framesVisible;
      core?.engine.setFramesVisible(ui.framesVisible);
      return;
    case 'mv-active-frame-visible':
      ui.activeFrameVisible = !ui.activeFrameVisible;
      core?.engine.setActiveFrameVisible(ui.activeFrameVisible);
      return;
    case 'mv-sync-time':
      ui.syncTime = !ui.syncTime;
      core?.engine.setSyncTime(ui.syncTime);
      return;

    case 'help-guide':
      openDialog('help-guide');
      return;
    case 'help-wiki':
      window.open('https://celestiaproject.space/', '_blank', 'noopener');
      return;
    case 'help-gl-info':
      openDialog('gl-info');
      return;
    case 'help-about':
      openDialog('about');
      return;
    default:
      return;
  }
}

function setFps(value: number): void {
  // The limit throttles the shell's own frame loop, which is what drives the
  // engine's draw, so it belongs here rather than in the renderer.
  ui.fps = value;
}

/** Whether a body classification's orbits are drawn. */
function hasOrbit(classification: number): boolean {
  return (ui.orbitMask & classification) !== 0;
}

/**
 * Full screen, which is CelestiaAppWindow::slotToggleFullScreen.
 *
 * Qt calls showFullScreen() and, on the way in, hides the docks and the tool
 * bars and collapses the menu bar to zero height -- collapsing rather than
 * hiding it so that its shortcuts stay enabled
 * (switchToFullscreen, switchToNormal restores it). The browser's fullscreen
 * request is the equivalent of showFullScreen, and the CSS for .ui-fullscreen
 * does the hiding, so leaving full screen brings back whatever was on screen.
 */
async function toggleFullScreen(): Promise<void> {
  try {
    if (document.fullscreenElement === null)
      await document.documentElement.requestFullscreen();
    else
      await document.exitFullscreen();
  } catch (error) {
    ui.fullScreen = false;
    showMessage(`Full screen was refused: ${error instanceof Error ? error.message : String(error)}`, 3);
  }
}

/** The browser can leave full screen on its own, with Esc. */
function onFullscreenChange(): void {
  ui.fullScreen = document.fullscreenElement !== null;
}

function toggleFlag(flag: bigint): void {
  setFlag(flag, !hasFlag(flag));
}

// ------------------------------------------------------------- interaction

// The panels describe what the engine has selected, read from the engine, which
// is where the selection lives now.
function refreshInfo(): void {
  refreshSelectionMirror();
}

// Pointer deltas arrive in CSS pixels, but the engine measures them against the
// drawable, which is in device pixels. Celestia's own front ends bridge the two
// the same way, scaling the coordinates by the device pixel ratio before calling
// CelestiaCore::mouseMove.
function dragScale(): number {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;
  if (!canvas || !viewport) return 1;
  return canvas.width / Math.max(viewport.clientWidth, 1);
}

// CelestiaCore's button and modifier bits, from its own enum. Alt is only
// defined on Apple builds, where it stands in for a right drag.
const LEFT_BUTTON = 0x01;
const MIDDLE_BUTTON = 0x02;
const RIGHT_BUTTON = 0x04;
const SHIFT_KEY = 0x08;
const CONTROL_KEY = 0x10;

// CelestiaCore's Key enum, from celestiacore.h. The Qt widget maps its key
// events onto these and calls keyDown, which is what the arrows and the other
// special keys need: charEntered only carries typed characters, so without this
// an arrow key arrived as the name "ArrowUp" and did nothing.
const SPECIAL_KEYS: Record<string, number> = {
  ArrowLeft: 1,   // Key_Left
  ArrowRight: 2,  // Key_Right
  ArrowUp: 3,     // Key_Up
  ArrowDown: 4,   // Key_Down
  Home: 5,        // Key_Home
  End: 6,         // Key_End
  PageUp: 7,      // Key_PageUp
  PageDown: 8,    // Key_PageDown
  Insert: 9,      // Key_Insert
  Delete: 10,     // Key_Delete
};

/** Key_F11 and Key_F12, the two the core reads as capture keys. */
const CAPTURE_KEYS: Record<string, number> = { F11: 21, F12: 22 };

/**
 * The characters the MultiView menu sends, which are the ones Qt's slots send:
 * Ctrl+U, Ctrl+R, Tab, Ctrl+D and Delete, as CelestiaCore::charEntered reads
 * them. Those five actions are one call each because the core owns everything
 * they do; the three toggles beside them are the core's own settings.
 */
const MULTIVIEW_KEYS: Record<string, string> = {
  'mv-split-vertical': '\u0015',
  'mv-split-horizontal': '\u0012',
  'mv-cycle': '\u0009',
  'mv-single': '\u0004',
  'mv-delete': '\u007f',
};

function buttonBits(event: PointerEvent): number {
  if (event.button === 0) return LEFT_BUTTON;
  if (event.button === 1) return MIDDLE_BUTTON;
  return RIGHT_BUTTON;
}

function modifierBits(event: PointerEvent | WheelEvent | KeyboardEvent): number {
  let bits = 0;
  if (event.shiftKey) bits |= SHIFT_KEY;
  if (event.ctrlKey) bits |= CONTROL_KEY;
  return bits;
}

/** A pointer position in drawable pixels, the space the engine works in. */
function enginePoint(event: MouseEvent): { x: number; y: number } {
  const { x, y } = localCoordinates(event);
  const scale = dragScale();
  return { x: x * scale, y: y * scale };
}

function onPointerDown(event: PointerEvent): void {
  if (popup.value && event.button !== 2) {
    popup.value = null;
    return;
  }
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  drag.active = true;
  drag.moved = false;
  drag.button = buttonBits(event);
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;

  if (core === null) return;
  const { x, y } = enginePoint(event);
  core.engine.mouseButtonDown(x, y, drag.button | modifierBits(event));
}

function onPointerMove(event: PointerEvent): void {
  if (!drag.active) return;
  const dx = event.clientX - drag.lastX;
  const dy = event.clientY - drag.lastY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;

  // CelestiaCore decides what the drag means -- turning for a left drag,
  // travelling around the selection for a right one, the dolly and roll for the
  // two button drag, the zoom for shift -- so the deltas are passed straight
  // through.
  if (core === null) return;
  const scale = dragScale();
  core.engine.mouseMoveBy(dx * scale, dy * scale, drag.button | modifierBits(event));
}

function onPointerUp(event: PointerEvent): void {
  // Only forward a release for a press this viewport received. A menu opened
  // over the canvas consumes its own presses -- the popup stops pointerdown --
  // so without this the release still reached here and was sent with whichever
  // button the last press used, which after a right click meant a spurious
  // right release: the engine picked whatever was under the menu and asked for
  // another context menu, reopening the one that had just closed.
  const pressed = drag.active;
  drag.active = false;

  if (core === null || !pressed) return;
  const { x, y } = enginePoint(event);
  core.engine.mouseButtonUp(x, y, drag.button | modifierBits(event));

  // A click that hit something became the engine's selection; a right click
  // that hit something also asked for a context menu.
  refreshInfo();

  const request = core.engine.takeContextMenuRequest();
  if (request !== null && request.selection !== null) {
    // The menu describes what the engine picked, which a right click does
    // without selecting, so it is not the shell's current selection.
    popup.value = { x: event.clientX, y: event.clientY, picked: request.selection };
  }
}

function localCoordinates(event: MouseEvent): { x: number; y: number } {
  const rect = viewportRef.value?.getBoundingClientRect();
  if (!rect) return { x: event.clientX, y: event.clientY };
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/**
 * Copies the engine's selection into the shell's own simulation.
 *
 * The viewport belongs to the WebAssembly engine, so a click selects there; the
 * information panel, the HUD and the selection popup all read the shell's
 * simulation. Without this they would keep describing whatever was selected
 * before -- or nothing at all.
 */

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  // One wheel notch is what CelestiaCore::mouseWheel calls a motion of one:
  // the Qt front end sends -1 for a notch up and +1 for a notch down, and the
  // core turns that into dollyMotion = 0.25 * motion, applied over the next
  // tenth of a second by tick.
  if (core === null) return;
  core.engine.mouseWheel(event.deltaY < 0 ? -1 : 1, modifierBits(event));
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;

  const key = event.key;

  // The menu accelerators come first, because that is the order Qt handles them
  // in: a QAction's shortcut is a shortcut on the window and is dispatched
  // before the key reaches the GL widget. They are looked up from the menus
  // themselves, so a label and its shortcut cannot disagree, and this is also
  // what makes Alt+Enter work -- Celestia's full screen shortcut is an Alt
  // combination, and the rest of the handling leaves those to the browser.
  const shortcut = acceleratorFor(event);
  if (shortcut !== null) {
    event.preventDefault();
    void onMenuAction(shortcut);
    return;
  }

  if (event.metaKey || event.altKey) return;

  // Arrows, Home, End, the page keys and Delete go to the engine's keyDown, the
  // way QtGlWidget::keyPressEvent forwards them; charEntered only carries typed
  // characters and would receive the key's name as if it were text.
  const special = SPECIAL_KEYS[key];
  if (special !== undefined) {
    event.preventDefault();
    core?.engine.keyDown(special, modifierBits(event));
    return;
  }
  if (key === 'Escape') {
    core?.engine.cancelMotion();
    showMessage('Motion cancelled', 2);
    return;
  }
  if (key === 'F11' || key === 'F12') {
    // A capture's start, pause and end, which CelestiaCore::keyDown owns: it
    // holds the capture object, so the shell reads the state back afterwards
    // rather than deciding anything itself. These two are also the browser's
    // full screen and developer tools keys, which is why they are forwarded
    // here rather than through the menu accelerator table.
    event.preventDefault();
    core?.engine.keyDown(CAPTURE_KEYS[key], modifierBits(event));
    syncCaptureFromEngine();
    return;
  }

  // Everything else is CelestiaCore's own command set. The shell used to carry a
  // TypeScript port of charEntered; it is the core's now.
  const consumed = core?.engine.charEntered(key, modifierBits(event)) ?? false;
  if (consumed) event.preventDefault();
}

/**
 * Releases a key with the engine.
 *
 * The arrows and the other special keys steer the observer while they are held,
 * so the core has to be told when one comes back up or it would keep moving.
 */
function onKeyUp(event: KeyboardEvent): void {
  if (event.metaKey) return;
  const special = SPECIAL_KEYS[event.key];
  if (special === undefined) return;
  event.preventDefault();
  core?.engine.keyUp(special, modifierBits(event));
}

/**
 * The action a keyboard shortcut names, or null.
 *
 * Qt gives each QAction a shortcut and connects it to the same slot the menu
 * item uses, so pressing the accelerator is the same as choosing the item. The
 * table is built from the menus, which is what keeps the two in step.
 */
function acceleratorFor(event: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  return ACCELERATOR_ACTIONS.get(parts.join('+')) ?? null;
}

/** Shortcuts taken from the menu model, the way Qt reads them from its actions. */
const ACCELERATOR_ACTIONS = new Map<string, string>();

function rebuildAccelerators(): void {
  ACCELERATOR_ACTIONS.clear();
  for (const menu of menus.value) collectAccelerators(menu.items);
}

watch(menus, rebuildAccelerators, { immediate: true });

function collectAccelerators(items: readonly MenuItem[]): void {
  for (const item of items) {
    if (item.id !== undefined && item.accelerator !== undefined && item.accelerator !== '') {
      ACCELERATOR_ACTIONS.set(normaliseAccelerator(item.accelerator), item.id);
    }
    if (item.items !== undefined) collectAccelerators(item.items);
  }
}

function normaliseAccelerator(accelerator: string): string {
  const parts = accelerator.split('+').map((part) => part.trim());
  const key = parts.pop() ?? '';
  const modifiers = parts.map((part) => part.toLowerCase()).sort();
  // The order is fixed so both sides of the comparison agree.
  const ordered = ['ctrl', 'shift', 'alt'].filter((name) => modifiers.includes(name));
  return [...ordered, key.length === 1 ? key.toLowerCase() : key].join('+');
}

// ------------------------------------------------------------------ loop

function frame(now: number): void {
  if (disposed) return;
  rafHandle = requestAnimationFrame(frame);

  const dt = lastFrame === 0 ? 1 / 60 : Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;

  const fpsLimit = ui.fps;
  if (fpsLimit > 0) {
    const minimumInterval = 1000 / fpsLimit - 0.5;
    if (now - lastFrameMs < minimumInterval) return;
  }
  lastFrameMs = now;

  if (core === null) return;
  // The core owns the clock: this advances it by dt * timeScale, or leaves it
  // alone while paused, and runs the observer journeys. The HUD reads the date
  // back from it, so there is only one clock.
  core.engine.advanceTime(dt);
  core.renderFrame();

  // The core changes its own selection -- Celestia's startup script selects the
  // Earth a few seconds in, and so does a click it handles itself -- and has no
  // notification, so the panels are refreshed when the name changes.
  const name = core.engine.selectionName();
  if (name !== lastSelectionName) {
    lastSelectionName = name;
    refreshSelectionMirror();
  }
}


let lastFrameMs = 0;
let lastSelectionName: string | null = null;



function formatDistanceLocal(km: number): string {
  if (km >= 1e7) return `${(km / KM_PER_AU).toFixed(3)} au`;
  if (km >= 1e9) return `${(km / KM_PER_LY).toFixed(3)} ly`;
  if (km > 1) return `${km.toFixed(1)} km`;
  return `${(km * 1000).toFixed(1)} m`;
}

// -------------------------------------------------------------- cel urls

function buildCelUrl(): string {
  // The engine owns the selection, and its path is what a cel URL addresses.
  const picked = core?.selectedObject() ?? null;
  const target = picked?.path ? `Sol:${picked.path.split('/').slice(1).join(':')}` : '';
  return `cel://Follow/${target}?x=0&y=0&z=0&ow=0&ox=0&oy=0&oz=1&time=${core?.engine.getTime() ?? 0}`;
}

function applyCelUrl(url: string): void {
  const match = /cel:\/\/Follow\/([^?]+)/.exec(url);
  if (match) {
    const path = match[1].replace(/:/g, '/');
    // The engine resolves the path and holds the selection; the shell only
    // reports what happened.
    if (core?.engine.objectExists(path)) {
      core.engine.selectObject(path);
      refreshInfo();
      showMessage(`Loaded ${path}`, 2);
      return;
    }
  }
  showMessage('The URL could not be parsed', 3);
}

function applyBookmark(id: string): void {
  for (const folder of bookmarks.menu) {
    const found = findBookmark(folder.children, id);
    if (found) {
      applyCelUrl(found);
      return;
    }
  }
  for (const folder of bookmarks.toolbar) {
    const found = findBookmark(folder.children, id);
    if (found) {
      applyCelUrl(found);
      return;
    }
  }
}

function findBookmark(nodes: typeof bookmarks.menu[number]['children'], id: string): string | null {
  for (const node of nodes) {
    if (node.kind === 'bookmark' && node.id === id) return node.url;
    if (node.kind === 'folder') {
      const found = findBookmark(node.folder.children, id);
      if (found) return found;
    }
  }
  return null;
}

// -------------------------------------------------------------- image output

function grabImage(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `celestia-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(url);
    showMessage('Image saved', 2);
  }, 'image/png');
}

async function copyImage(): Promise<void> {
  const canvas = canvasRef.value;
  if (!canvas) return;
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showMessage('Image copied to the clipboard', 2);
  } catch {
    showMessage('The browser blocked clipboard image access', 3);
  }
}

// -------------------------------------------------------------- video output

/**
 * Starts a capture, which is CelestiaAppWindow::slotCaptureVideo: it asks for the
 * output file and then for the encoding settings, and the recorder is built from
 * the second dialog's answer.
 *
 * Both dialogs are shown whatever the engine is doing, as the Qt slot does. It is
 * initMovieCapture that decides: it keeps the first capture it is given and does
 * nothing with a later one, so answering both dialogs while a capture is already
 * armed leaves that capture running and the answer unused. Everything after that
 * is F11 and F12, which the core handles.
 */
async function slotCaptureVideo(): Promise<void> {
  if (!await chooseCaptureTarget()) return;
  openDialog('capture-video');
}

// ------------------------------------------------------------------ layout

// The canvas is sized in device pixels; the engine's drawable follows it.
function applyCanvasSize(): { width: number; height: number } {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;
  if (!canvas || !viewport) return { width: 0, height: 0 };
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(viewport.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(viewport.clientHeight * dpr));
  return { width: canvas.width, height: canvas.height };
}

function onResize(): void {
  const size = applyCanvasSize();
  if (size.width > 0) core?.resize(size.width, size.height);
}

// The drawable follows the viewport's box, whatever changes it: a window resize,
// a dock opening, a scrollbar. Celestia's Qt front end gets this from the widget
// system, which calls resizeGL whenever the widget is resized, and it never
// tracks the panels itself. Watching the box is the equivalent: without it the
// drawing buffer keeps its old size while CSS stretches it into the new one.
let viewportObserver: ResizeObserver | null = null;

function observeViewport(): void {
  const viewport = viewportRef.value;
  if (!viewport || viewportObserver !== null || typeof ResizeObserver === 'undefined') return;
  viewportObserver = new ResizeObserver(() => onResize());
  viewportObserver.observe(viewport);
}

// ------------------------------------------------------------------ watchers

watch(() => ui.renderFlags, () => {
  // Keep the reactive mirror and the simulation in step when a dialog writes
  // directly to the flag set.
  core?.engine.setRenderFlags(Number(ui.renderFlags));
  core?.engine.setLabelMode(ui.labelMode);
  core?.engine.setOrbitMask(ui.orbitMask);
});
watch(() => ui.selectionInfo, () => { /* the panel reads this directly */ });

onMounted(async () => {
  if (!canvasRef.value || !viewportRef.value) return;

  const size = applyCanvasSize();
  observeViewport();
  setCaptureSource(canvasRef.value);

  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onFullscreenChange);

  // Everything the settings hold lives in ui or in the bookmarks, so watching
  // those two covers every way it can change -- a menu item, a dialog, a tool bar
  // button -- without each of them having to remember to say so.
  watch(ui, storeSettings, { deep: true });
  watch(bookmarks, storeSettings, { deep: true });
  window.addEventListener('beforeunload', storeSettingsNow);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  rafHandle = requestAnimationFrame(frame);

  // The viewport is drawn by Celestia's own renderer, compiled to WebAssembly.
  // Every other part of this window still reads the shell's own state, so the
  // two run side by side while the port is in progress.
  try {
    core = await loadCelestiaCore({
      canvasSelector: '#view',
      width: size.width,
      height: size.height,
      // The splash shows these while the catalogues load; the Qt front end
      // hands them to QSplashScreen::showMessage the same way.
      onProgress: (message) => { ui.loadingMessage = message; },
    });
    if (disposed) {
      setCore(null);
  core = null;
      return;
    }

    ui.starCount = core.starCount;

    // The layout can settle while the catalogues are loading, and a resize
    // during that time is dropped because the core does not exist yet, so it
    // would keep the size measured at mount. The core's metrics decide where its
    // HUD puts right aligned text, so a stale width clips it.
    onResize();

    // The viewport is live now, so register it and let the shell adopt the
    // engine's state rather than the other way round. The engine starts on
    // Celestia's own defaults, which are not the shell's copies of them: its
    // star style is FuzzyPointStars where the shell says PointSpreadFunction,
    // and pushing the shell's values over them visibly changed the scene --
    // the Sun lost its glow and faint stars stopped being drawn. The shell now
    // reads the engine back, and only ever writes when the user changes
    // something.
    setCore(core);

    // What was stored goes in through the engine before the shell reads the
    // engine back, so the window opens showing what was restored rather than its
    // own defaults.
    restoreSettings();

    ui.renderFlags = BigInt(core.engine.renderFlags());
    ui.labelMode = core.engine.labelMode();
    ui.starStyle = core.engine.starStyle() as StarStyle;
    ui.orbitMask = core.engine.orbitMask();

    // The core has been running since before this window registered -- it ran
    // Celestia's startup script -- so the panels take its selection now rather
    // than waiting for the first click.
    refreshSelectionMirror();

    // The Scripts menu lists what Celestia's own scanner finds, which is what the
    // Qt front end's menu is built from.
    ui.scripts = core.engine.scanScripts('scripts', false)
      .map((script) => ({ title: script.title, path: script.path }));

    (globalThis as Record<string, unknown>).__celestia = {
      get core() {
        return core;
      },
    };
  } catch (error) {
    console.error('[celestia] engine failed to load', error);
    showMessage(`Engine failed to load: ${(error as Error).message}`, 6);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(rafHandle);
  setCaptureSource(null);
  viewportObserver?.disconnect();
  viewportObserver = null;
  window.removeEventListener('resize', onResize);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('beforeunload', storeSettingsNow);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  // The engine's WebAssembly instance is not torn down here: the context and
  // the catalogue it holds stay valid for the page's lifetime.
  core = null;
});

// Expose the shell's entry points to the dialog host.
defineExpose({ onMenuAction, refreshInfo });

const showSelectionPopup = computed(() => popup.value !== null);

// The flash message is drawn for a fixed period; the clock is sampled from the
// render loop so the template does not need to read it directly.
</script>

<template>
  <!-- Qt constructs this window and calls init() on it before show(), so during
       loading it exists but nothing of it is on screen; visibility keeps the
       layout, which is what the viewport measures itself against. -->
  <div
    class="ui-window"
    :class="{ 'ui-fullscreen': ui.fullScreen, 'ui-window-loading': !ui.ready }"
  >
    <QtMenu :menus="menus" :icon-url="iconUrl" @action="onMenuAction" />

    <ToolBars
      :on-action="onMenuAction"
      :icon-url="iconUrl"
      @time-command="(command: string) => $emit('time-command', command)"
    />

    <div class="ui-central">
      <BrowserDock v-if="ui.showCelestialBrowser" @select="refreshInfo" />

      <div class="ui-viewport" ref="viewportRef">
        <canvas
          id="view"
          ref="canvasRef"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
          @wheel="onWheel"
          @contextmenu.prevent
        />
        <SelectionPopup
          v-if="showSelectionPopup && popup"
          :x="popup.x"
          :y="popup.y"
          :picked="popup.picked"
          @close="popup = null"
          @changed="refreshInfo"
        />
      </div>

      <!-- Qt puts the Event Finder and the Info Browser in docks of their own,
           both hidden until their menu item is chosen; only the Celestial
           Browser is shown to begin with. -->
      <EventFinder v-if="ui.showEventFinder" />
      <InfoPanel v-if="ui.showInfoBrowser" :html="ui.selectionInfo" />
    </div>

    <DialogHost />
  </div>
</template>

<style scoped>
/* Hidden until the engine has started, which is when Qt shows the window. */
.ui-window-loading {
  visibility: hidden;
}

</style>
