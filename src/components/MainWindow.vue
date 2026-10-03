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
  setPaused, setSelection, setTimeScale, showMessage, ui, applyStarStyle, applyResolution,
  applyStarColorTable, EMPTY_VEC,
} from '@/store/app';
import { RenderFlags, RenderLabels, StarStyle, TextureResolution } from '@/core/simulation';
import { loadCelestiaCore, type CelestiaCoreHandle } from '@/engine/celestiaCore';
import { CommandController } from '@/core/commands';
import { buildInfoPage } from '@/core/objectInfo';
import { formatLocal } from '@/core/objectInfo';
import { Selection } from '@/core/selection';
import { vec3, degToRad, J2000, KM_PER_AU, KM_PER_LY, add, sub, length, normalize } from '@/core/math';
import { TDBtoUTC } from '@/core/astro';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const viewportRef = ref<HTMLDivElement | null>(null);

let core: CelestiaCoreHandle | null = null;
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

  // Dragging turns the engine's camera. The shell's own observer still follows
  // the same gesture so its panels stay consistent.
  if (drag.left && drag.right) {
    if (Math.abs(dx) > Math.abs(dy)) core?.orbitBy(dx * 0.5, 0);
    else core?.zoomBy(Math.exp(dy * 0.002));
  } else if (drag.left && drag.shift) {
    core?.zoomBy(Math.exp(dy * 0.002));
  } else if (drag.left && drag.ctrl) {
    core?.zoomBy(Math.exp(dy * 0.002));
  } else if (drag.left) {
    core?.orbitBy(dx, dy);
  } else if (drag.right && drag.shift) {
    core?.orbitBy(dx, dy);
  } else if (drag.right) {
    core?.orbitBy(dx, dy);
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

// Hands a viewport point to the engine's renderer, which selects whatever is
// under it. The shell's own selection is separate and stays put.
function pickInEngine(x: number, y: number): void {
  const canvas = canvasRef.value;
  const viewport = viewportRef.value;
  if (!canvas || !viewport || core === null) return;
  const scaleX = canvas.width / Math.max(viewport.clientWidth, 1);
  const scaleY = canvas.height / Math.max(viewport.clientHeight, 1);
  core.engine.pickAt(x * scaleX, y * scaleY, canvas.width, canvas.height);
}

function handleClick(event: MouseEvent): void {
  const { x, y } = localCoordinates(event);
  pickInEngine(x, y);
  if (event.detail >= 2) core?.centerSelection();
}

function openContextMenu(event: MouseEvent): void {
  const e = engine();
  const { x, y } = localCoordinates(event);
  pickInEngine(x, y);
  refreshInfo();
  popup.value = { x: event.clientX, y: event.clientY, selection: e.simulation.getSelection().clone() };
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  // Scrolling up narrows the field of view, matching Celestia's own binding.
  core?.zoomBy(Math.exp(event.deltaY * 0.001));
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

  if (core === null) return;
  // The engine drives its own clock: travel animations and the goto journeys
  // only advance when its Simulation is ticked.
  core.engine.advanceTime(dt);
  core.renderFrame();
  recordFrame(dt);
  ui.timeDisplay = e.simulation.timeControl.formatDate(ui.timeZoneBias !== 0, ui.dateFormat === 1);
}

let lastFrameMs = 0;

// Frame rate for the HUD, measured over the viewport's own draw calls.
let fpsFrames = 0;
let fpsSince = 0;

function recordFrame(_dt: number): void {
  fpsFrames++;
  const now = performance.now();
  if (fpsSince === 0) fpsSince = now;
  const elapsed = now - fpsSince;
  if (elapsed >= 500) {
    ui.fps = (fpsFrames * 1000) / elapsed;
    fpsFrames = 0;
    fpsSince = now;
  }
  rebuildHud();
}

// The HUD is an overlay of absolutely positioned lines. Celestia draws its own
// HUD with the same GL context as the scene, but here the scene belongs to the
// wasm renderer, so the shell renders the overlay in the DOM instead.
interface HudLine {
  key: string;
  text: string;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  weight?: number;
}

const hudLines = ref<HudLine[]>([]);

function rgba(color: [number, number, number, number]): string {
  const [r, g, b, a] = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

function rebuildHud(): void {
  const e = engine();
  const simulation = e.simulation;
  const observer = e.observer;
  const bright: [number, number, number, number] = [0.72, 0.72, 1, 1];
  const dim: [number, number, number, number] = [0.72, 0.72, 1, 0.9];
  const faint: [number, number, number, number] = [0.6, 0.6, 1, 0.9];
  const lines: HudLine[] = [];

  // Top right: date and time rate.
  lines.push({
    key: 'date',
    text: simulation.timeControl.formatDate(ui.timeZoneBias !== 0, false),
    top: 18, right: 12, size: 13, color: rgba(bright), align: 'right',
  });
  const paused = simulation.getPauseState() || simulation.timeControl.isStopped();
  lines.push({
    key: 'rate',
    text: simulation.timeControl.getRateDescription() + (simulation.getPauseState() ? ' (Paused)' : ''),
    top: 34, right: 12, size: 13, color: rgba(paused ? [1, 0.25, 0.25, 1] : bright), align: 'right',
  });

  // Bottom left: frame rate and speed.
  let leftBottom = 30;
  if (ui.showFPS) {
    lines.push({ key: 'fps', text: `FPS: ${ui.fps.toFixed(1)}`, bottom: leftBottom, left: 12, size: 12, color: rgba(dim), align: 'left' });
    leftBottom += 15;
  }
  lines.push({
    key: 'speed',
    text: commands?.speedDescription() ?? 'Speed: 0 m/s',
    bottom: 14, left: 12, size: 12, color: rgba(dim), align: 'left',
  });

  // Bottom right: travel mode and field of view.
  lines.push({
    key: 'travel',
    text: commands?.travelDescription() ?? 'Travelling',
    bottom: 30, right: 12, size: 12, color: rgba(faint), align: 'right',
  });
  const fov = observer.getFovDegrees();
  lines.push({
    key: 'fov',
    text: `FOV: ${fov.toFixed(1)}° (${(45 / fov).toFixed(2)}x)`,
    bottom: 14, right: 12, size: 12, color: rgba(dim), align: 'right',
  });

  // Top left: selection name and detail.
  const selection = simulation.getSelection();
  if (!selection.isEmpty && ui.hudDetail !== 0) {
    lines.push({
      key: 'selection',
      text: selection.getName(),
      top: 18, left: 12, size: 13, color: rgba(bright), align: 'left', weight: 600,
    });
    let y = 34;
    for (const [index, text] of buildHudDetail(selection, e, 0).entries()) {
      lines.push({ key: `detail-${index}`, text, top: y, left: 12, size: 12, color: rgba(dim), align: 'left' });
      y += 14;
    }
  }

  if (drag.active) {
    lines.push({
      key: 'edit',
      text: 'Edit Mode',
      top: 16, left: 0, right: 0, size: 13, color: rgba([1, 0, 1, 1]), align: 'center',
    });
  }

  hudLines.value = lines;
}

function hudStyle(line: HudLine): Record<string, string> {
  const style: Record<string, string> = {
    fontSize: `${line.size}px`,
    color: line.color,
    fontWeight: String(line.weight ?? 400),
  };
  if (line.top !== undefined) style.top = `${line.top}px`;
  if (line.bottom !== undefined) style.bottom = `${line.bottom}px`;
  if (line.align === 'center') {
    style.left = '50%';
    style.transform = 'translateX(-50%)';
  } else if (line.align === 'right') {
    style.right = `${line.right ?? 12}px`;
  } else {
    style.left = `${line.left ?? 12}px`;
  }
  return style;
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
});
watch(() => ui.selectionInfo, () => { /* the panel reads this directly */ });

onMounted(async () => {
  if (!canvasRef.value || !viewportRef.value) return;

  const e = engine();

  commands = new CommandController({
    simulation: e.simulation,
    observer: e.observer,
    universe: e.universe,
    flash: (message) => showMessage(message, 3),
    refreshInfo,
    onSelectionChanged: () => { /* nothing extra for now */ },
  });

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
      core = null;
      return;
    }

    ui.starCount = core.starCount;
    // CelestiaCore opens on Earth after loading start.cel.
    core.gotoObject('Sol/Earth', 24000);

    (globalThis as Record<string, unknown>).__celestia = {
      engine: e,
      get core() {
        return core;
      },
      get commandController() {
        return commands;
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
        <div class="qt-hud">
          <div
            v-for="line in hudLines"
            :key="line.key"
            class="qt-hud-line"
            :style="hudStyle(line)"
          >{{ line.text }}</div>
        </div>
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
