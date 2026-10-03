<script setup lang="ts">
// The main window: menu bar, tool bars, viewport, docks and dialog host.
//
// This is CelestiaAppWindow, the central widget of the Qt shell. The render loop,
// the HUD overlay, the mouse and keyboard bindings and the dock layout all live
// here; the heavier widgets are separate components.

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import QtMenu from './QtMenu.vue';
import ToolBars from './ToolBars.vue';
import InfoPanel from './InfoPanel.vue';
import BrowserDock from './BrowserDock.vue';
import SelectionPopup from './SelectionPopup.vue';
import DialogHost from './dialogs/DialogHost.vue';
import { buildMenus } from './menus';
import type { QtMenuItem } from './qtMenuModel';
import {
  bookmarks, closeDialog, engine, hasFlag, openDialog, setCore, setFlag, setLabel, setOrbitClassification,
  setPaused, setSelection, setTimeScale, showMessage, ui, applyStarStyle, applyResolution,
  applyStarColorTable, EMPTY_VEC,
} from '@/store/app';
import { RenderFlags, RenderLabels, StarStyle, TextureResolution } from '@/core/simulation';
import { loadCelestiaCore, type CelestiaCoreHandle } from '@/engine/celestiaCore';
import { buildInfoPage } from '@/core/objectInfo';
import { formatLocal } from '@/core/objectInfo';
import { Selection, type SelectionKind } from '@/core/selection';
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
const popup = shallowRef<{ x: number; y: number; selection: Selection } | null>(null);

// ------------------------------------------------------------------- menus

const menus = computed(() => buildMenus(bookmarkMenuItems()));

function bookmarkMenuItems(): QtMenuItem[] {
  const items: QtMenuItem[] = [
    { kind: 'action', id: 'bookmark-add', label: 'Add Bookmark...', icon: 'bookmark-add.png' },
    { kind: 'action', id: 'bookmark-organize', label: 'Organize Bookmarks...', icon: 'application-bookmark.png' },
    { kind: 'separator' },
  ];
  walkBookmarks(bookmarks.menu, items);
  return items;
}

function walkBookmarks(folders: typeof bookmarks.menu, out: QtMenuItem[]): void {
  for (const folder of folders) {
    const children: QtMenuItem[] = [];
    for (const child of folder.children) {
      if (child.kind === 'separator') {
        children.push({ kind: 'separator' });
      } else if (child.kind === 'folder') {
        const nested: QtMenuItem[] = [];
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
  const simulation = engine().simulation;
  const observer = engine().observer;

  if (id.startsWith('bookmark:')) {
    applyBookmark(id.slice('bookmark:'.length));
    return;
  }
  if (id.startsWith('script:')) {
    showMessage(`Running script ${id.slice('script:'.length)} is not enabled in the web build`, 4);
    return;
  }

  switch (id) {
    case 'file-grab-image':
      grabImage();
      return;
    case 'file-capture-video':
      showMessage('Video capture requires the FFmpeg-enabled desktop build', 4);
      return;
    case 'file-copy-image':
      copyImage();
      return;
    case 'file-open-script':
      openDialog('open-script');
      return;
    case 'file-preferences':
      openDialog('preferences');
      return;
    case 'file-exit':
      showMessage('Close the browser tab to exit', 3);
      return;

    case 'nav-select-sun':
      setSelection(Selection.forBody(engine().universe.sol));
      observer.gotoSelection(engine().universe.sol.radius * 5, vec3(0, 0, 1), 1.2);
      refreshInfo();
      return;
    case 'nav-center':
      core?.centerSelection();
      return;
    case 'nav-goto': {
      // The engine owns the camera, and its selection came from the viewport,
      // so it is the one that knows the target's path.
      const target = core?.selectedObject() ?? null;
      if (target !== null) {
        const distance = target.radiusKm > 0 ? target.radiusKm * 5 : 24000;
        core?.gotoObject(target.path || target.name, distance);
      }
      return;
    }
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
      simulation.lightDelayActive = ui.lightDelayActive;
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
    case 'display-auto-magnitude':
      toggleFlag(RenderFlags.ShowAutoMag);
      simulation.autoMag = hasFlag(RenderFlags.ShowAutoMag);
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
      simulation.fps = 0;
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
      ui.fullScreen = !ui.fullScreen;
      return;

    case 'mv-split-vertical':
    case 'mv-split-horizontal':
    case 'mv-cycle':
    case 'mv-single':
    case 'mv-delete':
    case 'mv-frames-visible':
    case 'mv-active-frame-visible':
    case 'mv-sync-time':
      showMessage('Multi view requires several GL widgets; the web shell renders a single view', 4);
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
  engine().simulation.fps = value;
  ui.fps = value;
}

function toggleFlag(flag: bigint): void {
  setFlag(flag, !hasFlag(flag));
}

// ------------------------------------------------------------- interaction

function refreshInfo(): void {
  const e = engine();
  ui.selectionInfo = buildInfoPage(e.simulation.getSelection(), e.universe, e.simulation.getTime());
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

// CelestiaCore::Key_Left onwards: Left 1, Right 2, Up 3, Down 4, Home 5, End 6.
const KEY_HOME = 5;
const KEY_END = 6;

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
  drag.active = false;

  if (core === null) return;
  const { x, y } = enginePoint(event);
  core.engine.mouseButtonUp(x, y, drag.button | modifierBits(event));

  // A click that hit something became the engine's selection; a right click
  // that hit something also asked for a context menu.
  mirrorEngineSelection();
  refreshInfo();

  const request = core.engine.takeContextMenuRequest();
  if (request !== null) {
    popup.value = {
      x: event.clientX,
      y: event.clientY,
      selection: engine().simulation.getSelection().clone(),
    };
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
function mirrorEngineSelection(): boolean {
  if (core === null) return false;

  const picked = core.selectedObject();
  if (picked === null) {
    setSelection(null);
    return false;
  }

  // Bodies carry a path; stars and deep sky objects only a name. The name is
  // tried as well, since the shell's own solar system is a flat registry.
  const universe = engine().universe;
  const resolved = universe.findObjectFromPath(picked.path || picked.name)
    ?? (picked.name ? universe.findObjectFromPath(picked.name) : null);

  if (resolved !== null) {
    setSelection(resolved);
    return true;
  }

  // The engine carries Celestia's own catalogues -- 2.4 million stars against
  // the shell's 41 thousand, and the official deep sky lists -- so it can pick
  // an object the shell has never heard of. Show what the engine reported
  // rather than clearing the selection and leaving the click looking ignored.
  setSelection(null);
  const kind = picked.type.toLowerCase();
  ui.selectionKind = (['star', 'body', 'deepsky', 'location'].includes(kind) ? kind : 'none') as SelectionKind;
  ui.selectionName = picked.name;
  ui.selectionInfo = '<html><head><title>Info</title></head><body>'
    + `<h1>${picked.name}</h1>`
    + `<p>${picked.type} taken from the engine's catalogue, which this shell's `
    + 'smaller catalogue does not carry.</p></body></html>';
  return false;
}

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
  if (event.metaKey || event.altKey) return;

  const ctrl = event.ctrlKey;
  const key = event.key;

  // Keys that map to menu accelerators first.
  if (key === 'F10' && event.shiftKey) {
    event.preventDefault();
    onMenuAction('file-capture-video');
    return;
  }
  if (key === 'F10') {
    event.preventDefault();
    onMenuAction('file-grab-image');
    return;
  }
  if (ctrl && (key === 'q')) {
    event.preventDefault();
    onMenuAction('file-exit');
    return;
  }
  if (key === 'Home' || key === 'End') {
    event.preventDefault();
    // CelestiaCore::Key_Home and Key_End: moving along the view is its job.
    core?.engine.keyDown(key === 'Home' ? KEY_HOME : KEY_END, modifierBits(event));
    return;
  }
  if (key === 'Escape') {
    engine().observer.cancelMotion();
    showMessage('Motion cancelled', 2);
    return;
  }
  if (key === 'F11' || key === 'F12') {
    event.preventDefault();
    return;
  }

  // Everything else is CelestiaCore's own command set. The shell used to carry a
  // TypeScript port of charEntered; it is the core's now.
  const consumed = core?.engine.charEntered(key, modifierBits(event)) ?? false;
  if (consumed) event.preventDefault();
}

// ------------------------------------------------------------------ loop

function frame(now: number): void {
  if (disposed) return;
  rafHandle = requestAnimationFrame(frame);

  const e = engine();
  const dt = lastFrame === 0 ? 1 / 60 : Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;

  const fpsLimit = e.simulation.fps;
  if (fpsLimit > 0) {
    const minimumInterval = 1000 / fpsLimit - 0.5;
    if (now - lastFrameMs < minimumInterval) return;
  }
  lastFrameMs = now;

  e.simulation.tick(dt);
  e.observer.update(dt, now / 1000);

  if (core === null) return;
  // The core owns the clock: this advances it by dt * timeScale, or leaves it
  // alone while paused, and runs the observer journeys. The HUD reads the date
  // back from it, so there is only one clock.
  core.engine.advanceTime(dt);
  core.renderFrame();
}


let lastFrameMs = 0;



function formatDistanceLocal(km: number): string {
  if (km >= 1e7) return `${(km / KM_PER_AU).toFixed(3)} au`;
  if (km >= 1e9) return `${(km / KM_PER_LY).toFixed(3)} ly`;
  if (km > 1) return `${km.toFixed(1)} km`;
  return `${(km * 1000).toFixed(1)} m`;
}

// -------------------------------------------------------------- cel urls

function buildCelUrl(): string {
  const e = engine();
  const selection = e.simulation.getSelection();
  const [ra, dec, dist] = e.observer.getOrientation().w.toFixed(6) === '' ? ['0', '0', '0'] : ['0', '0', '0'];
  void ra;
  void dec;
  void dist;
  const target = selection.body ? `Sol:${selection.body.name}` : selection.star ? `Star:${selection.star.index}` : '';
  return `cel://Follow/${target}?x=0&y=0&z=0&ow=0&ox=0&oy=0&oz=1&time=${e.simulation.getTime()}`;
}

function applyCelUrl(url: string): void {
  const match = /cel:\/\/Follow\/([^?]+)/.exec(url);
  if (match) {
    const path = match[1].replace(/:/g, '/');
    const selection = engine().universe.findObjectFromPath(path);
    if (selection) {
      setSelection(selection);
      refreshInfo();
      showMessage(`Loaded ${selection.getName()}`, 2);
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

// ------------------------------------------------------------------ watchers

watch(() => ui.showInfoBrowser, () => onResize());
watch(() => ui.showCelestialBrowser, () => onResize());
watch(() => ui.renderFlags, () => {
  // Keep the reactive mirror and the simulation in step when a dialog writes
  // directly to the flag set.
  const e = engine();
  e.simulation.setRenderFlags(ui.renderFlags);
  e.simulation.setLabelMode(ui.labelMode);
  e.simulation.setOrbitMask(ui.orbitMask);
  core?.engine.setRenderFlags(Number(ui.renderFlags));
  core?.engine.setLabelMode(ui.labelMode);
  core?.engine.setOrbitMask(ui.orbitMask);
});
watch(() => ui.selectionInfo, () => { /* the panel reads this directly */ });

onMounted(async () => {
  if (!canvasRef.value || !viewportRef.value) return;

  const e = engine();

  const size = applyCanvasSize();

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  rafHandle = requestAnimationFrame(frame);

  // The viewport is drawn by Celestia's own renderer, compiled to WebAssembly.
  // Every other part of this window still reads the shell's own state, so the
  // two run side by side while the port is in progress.
  try {
    core = await loadCelestiaCore({
      canvasSelector: '#view',
      width: size.width,
      height: size.height,
      onProgress: (message) => showMessage(message, 2),
    });
    if (disposed) {
      setCore(null);
  core = null;
      return;
    }

    ui.starCount = core.starCount;

    // The viewport is live now, so register it and let the shell adopt the
    // engine's state rather than the other way round. The engine starts on
    // Celestia's own defaults, which are not the shell's copies of them: its
    // star style is FuzzyPointStars where the shell says PointSpreadFunction,
    // and pushing the shell's values over them visibly changed the scene --
    // the Sun lost its glow and faint stars stopped being drawn. The shell now
    // reads the engine back, and only ever writes when the user changes
    // something.
    setCore(core);
    ui.renderFlags = BigInt(core.engine.renderFlags());
    ui.labelMode = core.engine.labelMode();
    ui.starStyle = core.engine.starStyle() as StarStyle;
    ui.orbitMask = core.engine.orbitMask();

    // CelestiaCore opens on Earth after loading start.cel.
    core.gotoObject('Sol/Earth', 24000);

    (globalThis as Record<string, unknown>).__celestia = {
      engine: e,
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
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onKeyDown);
  // The engine's WebAssembly instance is not torn down here: the context and
  // the catalogue it holds stay valid for the page's lifetime.
  core = null;
});

// Expose the shell's entry points to the dialog host.
defineExpose({ onMenuAction, refreshInfo });

const showSelectionPopup = computed(() => popup.value !== null);

// The flash message is drawn for a fixed period; the clock is sampled from the
// render loop so the template does not need to read it directly.
const messageVisible = computed(() => ui.message !== '' && performance.now() < ui.messageUntil);
</script>

<template>
  <div class="qt-window" :class="{ 'qt-fullscreen': ui.fullScreen }">
    <QtMenu :menus="menus" :icon-url="iconUrl" @action="onMenuAction" />

    <ToolBars
      :on-action="onMenuAction"
      :icon-url="iconUrl"
      @time-command="(command: string) => $emit('time-command', command)"
    />

    <div class="qt-central">
      <BrowserDock v-if="ui.showCelestialBrowser" @select="refreshInfo" />

      <div class="qt-viewport" ref="viewportRef">
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
        <div v-if="messageVisible" class="qt-message">{{ ui.message }}</div>
        <SelectionPopup
          v-if="showSelectionPopup && popup"
          :x="popup.x"
          :y="popup.y"
          :selection="popup.selection"
          @close="popup = null"
          @changed="refreshInfo"
        />
      </div>

      <InfoPanel v-if="ui.showInfoBrowser" :html="ui.selectionInfo" />
    </div>

    <DialogHost />
  </div>
</template>

<style scoped>
.qt-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1500;
}
</style>
