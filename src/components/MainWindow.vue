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
  bookmarks, closeDialog, engine, hasFlag, openDialog, setFlag, setLabel, setOrbitClassification,
  setPaused, setRenderer, setSelection, setTimeScale, showMessage, ui, applyStarStyle, applyResolution,
  applyStarColorTable, EMPTY_VEC,
} from '@/store/app';
import { RenderFlags, RenderLabels, StarStyle, TextureResolution } from '@/core/simulation';
import { Renderer } from '@/render/renderer';
import { CommandController } from '@/core/commands';
import { buildInfoPage } from '@/core/objectInfo';
import { formatLocal } from '@/core/objectInfo';
import { Selection } from '@/core/selection';
import { vec3, degToRad, J2000, KM_PER_AU, KM_PER_LY, add, sub, length, normalize } from '@/core/math';
import { TDBtoUTC } from '@/core/astro';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);

let renderer: Renderer | null = null;
let commands: CommandController | null = null;
let rafHandle = 0;
let lastFrame = 0;
let disposed = false;

// Mouse drag state, following the bindings in controls.txt.
const drag = { active: false, button: 0, left: false, right: false, lastX: 0, lastY: 0, shift: false, ctrl: false, moved: false };

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
      commands?.centerSelection();
      return;
    case 'nav-goto':
      commands?.gotoSelection(false);
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
      commands?.charEntered(']');
      return;
    case 'display-fewer-stars':
      commands?.charEntered('[');
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

function onPointerDown(event: PointerEvent): void {
  if (popup.value && event.button !== 2) {
    popup.value = null;
    return;
  }
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  drag.active = true;
  drag.moved = false;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.shift = event.shiftKey;
  drag.ctrl = event.ctrlKey;
  if (event.button === 0) drag.left = true;
  if (event.button === 2) drag.right = true;
  if (event.button === 1) {
    commands?.togglePreviousFov();
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!drag.active) return;
  const dx = event.clientX - drag.lastX;
  const dy = event.clientY - drag.lastY;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;

  if (drag.left && drag.right) {
    if (Math.abs(dx) > Math.abs(dy)) commands?.handleRollDrag(dx);
    else commands?.handleDistanceDrag(dy);
  } else if (drag.left && drag.shift) {
    commands?.handleShiftDrag(dx, dy);
  } else if (drag.left && drag.ctrl) {
    commands?.handleDistanceDrag(dy);
  } else if (drag.left) {
    commands?.handleLeftDrag(dx, dy);
  } else if (drag.right && drag.shift) {
    commands?.handleLeftDrag(dx, dy);
  } else if (drag.right) {
    commands?.handleRightDrag(dx, dy);
  }
}

function onPointerUp(event: PointerEvent): void {
  const wasMoved = drag.moved;
  drag.active = false;
  drag.left = false;
  drag.right = false;

  if (event.button === 2 && !wasMoved) {
    openContextMenu(event);
    return;
  }
  if (event.button === 0 && !wasMoved) {
    handleClick(event);
  }
}

function localCoordinates(event: MouseEvent): { x: number; y: number } {
  const rect = viewportRef.value?.getBoundingClientRect();
  if (!rect) return { x: event.clientX, y: event.clientY };
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function handleClick(event: MouseEvent): void {
  const e = engine();
  const { x, y } = localCoordinates(event);
  const picked = renderer?.pick(x, y, e.simulation.getTime()) ?? null;

  if (!picked) {
    if (drag.ctrl) return;
    e.simulation.clearSelection();
    refreshInfo();
    return;
  }

  e.simulation.setSelection(picked);
  const observer = e.observer;
  if (event.detail >= 2) {
    // Double click centres, as QCelestiaGlWidget does.
    observer.centerSelection();
  }
  refreshInfo();
}

function openContextMenu(event: MouseEvent): void {
  const e = engine();
  const { x, y } = localCoordinates(event);
  const picked = renderer?.pick(x, y, e.simulation.getTime()) ?? null;
  if (picked) e.simulation.setSelection(picked);
  refreshInfo();
  popup.value = { x: event.clientX, y: event.clientY, selection: e.simulation.getSelection().clone() };
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  commands?.handleWheel(event.deltaY);
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
    commands?.moveAlongView(key === 'Home' ? 0.2 : -0.6);
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

  const consumed = commands?.charEntered(key, event.shiftKey, ctrl) ?? false;
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

  const r = renderer;
  if (!r) return;
  r.recordFrame(dt);
  r.render(dt);
  drawHud(r, e);
  ui.fps = r.getAverageFrameRate();
  ui.timeDisplay = e.simulation.timeControl.formatDate(ui.timeZoneBias !== 0, ui.dateFormat === 1);
}

let lastFrameMs = 0;

function drawHud(r: Renderer, e: ReturnType<typeof engine>): void {
  const simulation = e.simulation;
  const observer = e.observer;
  const width = r['width'] as unknown as number;
  const height = r['height'] as unknown as number;
  void width;
  const lines: Array<{ text: string; x: number; y: number; size: number; color: [number, number, number, number]; align?: 'left' | 'center' | 'right'; weight?: number }> = [];

  const viewportWidth = viewportRef.value?.clientWidth ?? 800;
  const viewportHeight = viewportRef.value?.clientHeight ?? 600;

  // Top right: date and time rate.
  const dateText = simulation.timeControl.formatDate(ui.timeZoneBias !== 0, false);
  lines.push({ text: dateText, x: viewportWidth - 12, y: 18, size: 13, color: [0.72, 0.72, 1, 1], align: 'right' });
  const rateText = simulation.timeControl.getRateDescription() + (simulation.getPauseState() ? ' (Paused)' : '');
  const paused = simulation.getPauseState() || simulation.timeControl.isStopped();
  lines.push({ text: rateText, x: viewportWidth - 12, y: 34, size: 13, color: paused ? [1, 0.25, 0.25, 1] : [0.72, 0.72, 1, 1], align: 'right' });

  // Bottom left: FPS and speed.
  let leftY = viewportHeight - 30;
  if (ui.showFPS) {
    lines.push({ text: `FPS: ${ui.fps.toFixed(1)}`, x: 12, y: leftY, size: 12, color: [0.72, 0.72, 1, 0.9] });
    leftY += 15;
  }
  lines.push({ text: commands?.speedDescription() ?? 'Speed: 0 m/s', x: 12, y: viewportHeight - 14, size: 12, color: [0.72, 0.72, 1, 0.9] });

  // Bottom right: travel mode and field of view.
  const travel = commands?.travelDescription() ?? 'Travelling';
  lines.push({ text: travel, x: viewportWidth - 12, y: viewportHeight - 30, size: 12, color: [0.6, 0.6, 1, 0.9], align: 'right' });
  const fov = observer.getFovDegrees();
  lines.push({
    text: `FOV: ${fov.toFixed(1)}° (${(45 / fov).toFixed(2)}x)`,
    x: viewportWidth - 12,
    y: viewportHeight - 14,
    size: 12,
    color: [0.72, 0.72, 1, 0.9],
    align: 'right',
  });

  // Top left: selection name and detail.
  const selection = simulation.getSelection();
  if (!selection.isEmpty && ui.hudDetail !== 0) {
    lines.push({ text: selection.getName(), x: 12, y: 18, size: 13, color: [0.72, 0.72, 1, 1], weight: 600 });
    const detail = buildHudDetail(selection, e, viewportHeight);
    let y = 34;
    for (const line of detail) {
      lines.push({ text: line, x: 12, y, size: 12, color: [0.72, 0.72, 1, 0.9] });
      y += 14;
    }
  }

  if (drag.active) {
    lines.push({ text: 'Edit Mode', x: viewportWidth / 2, y: 16, size: 13, color: [1, 0, 1, 1], align: 'center' });
  }

  r.drawHudText(lines);
}

function buildHudDetail(selection: Selection, e: ReturnType<typeof engine>, _height: number): string[] {
  const out: string[] = [];
  const tdb = e.simulation.getTime();
  const camera = e.observer.position;
  const world = e.universe.getSelectionScenePosition(selection, tdb);
  const distance = length(sub(world, camera));

  if (selection.body) {
    const body = selection.body;
    out.push(`Distance: ${formatDistanceLocal(Math.max(distance - body.radius, 0))}`);
    const angular = (2 * Math.atan(body.radius / Math.max(distance - body.radius, 1))) * (180 / Math.PI) * 3600;
    if (angular > 0.5) out.push(`Apparent diameter: ${angular.toFixed(1)}"`);
    if (ui.hudDetail >= 2) {
      out.push(`Radius: ${body.radius.toFixed(0)} km`);
      out.push(`Sidereal rotation period: ${body.rotation.period.toFixed(4)} days`);
    }
  } else if (selection.star) {
    const star = selection.star;
    out.push(`Distance: ${formatDistanceLocal(distance)}`);
    out.push(`Abs (app) mag: ${star.absoluteMag.toFixed(2)} (${star.apparentMag.toFixed(2)})`);
    out.push(`Class: ${star.names?.n ? 'Star' : 'Star'}`);
  } else if (selection.deepsky) {
    out.push(`Type: ${selection.deepsky.type}`);
    out.push(`Apparent magnitude: ${selection.deepsky.magnitude.toFixed(1)}`);
  } else if (selection.location) {
    out.push(`Parent body: ${selection.location.parent.localizedName}`);
  }
  return out;
}

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

function onResize(): void {
  const element = viewportRef.value;
  if (!element || !renderer) return;
  renderer.resize(element.clientWidth, element.clientHeight, Math.min(window.devicePixelRatio || 1, 2));
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
});
watch(() => ui.selectionInfo, () => { /* the panel reads this directly */ });

onMounted(() => {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;
  if (!canvas || !viewport) return;

  const e = engine();
  renderer = new Renderer(canvas, e.simulation, e.observer, e.universe, e.markers);
  setRenderer(renderer);
  renderer.resize(viewport.clientWidth, viewport.clientHeight, Math.min(window.devicePixelRatio || 1, 2));

  commands = new CommandController({
    simulation: e.simulation,
    observer: e.observer,
    universe: e.universe,
    flash: (message) => showMessage(message, 3),
    refreshInfo,
    onSelectionChanged: () => { /* nothing extra for now */ },
  });

  // The Qt shell starts with Earth selected and followed, which is what
  // CelestiaCore does after loading start.cel.
  const earth = e.universe.bodiesByName.get('earth');
  if (earth) {
    e.simulation.setSelection(Selection.forBody(earth));
    e.observer.setTarget(Selection.forBody(earth), 'follow');
    const home = e.universe.getBodyScenePosition(earth, e.simulation.getTime());
    const offset = vec3(earth.radius * 5.2, earth.radius * 2.0, earth.radius * 3.4);
    e.observer.setPosition(add(home, offset));
    e.observer.frameCenter = Selection.forBody(earth);
    e.observer.centerSelection();
    refreshInfo();
  }

  ui.bodyCount = e.universe.bodies.length;
  ui.starCount = e.universe.starCatalog.count;

  // Handle for inspecting the running engine from the browser console.
  (globalThis as Record<string, unknown>).__celestia = {
    engine: e,
    get renderer() {
      return renderer;
    },
    get commandController() {
      return commands;
    },
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  rafHandle = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(rafHandle);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onKeyDown);
  renderer?.dispose();
  setRenderer(null);
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
