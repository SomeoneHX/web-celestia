<script setup lang="ts">
// The three tool bars of the Qt shell.
//
//   Time     eight icon buttons, ported from qttimetoolbar.cpp, in the same order
//   Guides   ten text only buttons, ported from the Guides tool bar in qtappwin.cpp,
//            with the Orbits and Labels submenus attached to O and L
//   Bookmarks generated from the bookmark toolbar tree, ported from BookmarkToolBar

import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import {
  bookmarks, hasFlag, hasLabel, setFlag, setPaused, setSimulationTime, setTimeScale,
  showMessage, t, ui, viewport,
} from '@/store/app';
import type { BookmarkFolder } from '@/store/app';
import { RenderFlags, RenderLabels } from '@/core/celestia';
import { buildLabelsSubmenu, buildOrbitsSubmenu } from './menus';
import MenuPopup from './MenuPopup.vue';
import type { MenuItem } from './menuModel';

const props = defineProps<{
  onAction: (id: string) => void | Promise<void>;
  iconUrl: (name: string) => string;
}>();

const emit = defineEmits<{ (event: 'time-command', command: string): void }>();

// --------------------------------------------------------------- time bar

const timeButtons = [
  { icon: 'time-reverse.png', tooltip: 'Reverse time', command: 'reverse' },
  { icon: 'time-slower.png', tooltip: '10x slower', command: 'slower-10' },
  { icon: 'time-half.png', tooltip: '2x slower', command: 'slower-2' },
  { icon: 'time-pause.png', tooltip: 'Pause time', command: 'pause' },
  { icon: 'time-double.png', tooltip: '2x faster', command: 'faster-2' },
  { icon: 'time-faster.png', tooltip: '10x faster', command: 'faster-10' },
  { icon: 'time-realtime.png', tooltip: 'Real time', command: 'realtime' },
  { icon: 'time-currenttime.png', tooltip: 'Set to current time', command: 'current' },
];

function onTimeButton(command: string): void {
  // The core owns the clock, so the rate is read from it and written back
  // through the store's time helpers.
  const view = viewport();
  if (view === null) return;
  const scale = view.engine.timeScale();
  switch (command) {
    case 'reverse':
      setTimeScale(-scale);
      break;
    case 'slower-10':
      setTimeScale(scale * 0.1);
      break;
    case 'slower-2':
      setTimeScale(scale * 0.5);
      break;
    case 'pause':
      setPaused(!view.engine.paused());
      break;
    case 'faster-2':
      setTimeScale(scale * 2);
      break;
    case 'faster-10':
      setTimeScale(scale * 10);
      break;
    case 'realtime':
      setTimeScale(1);
      break;
    case 'current':
      setCurrentTime();
      break;
    default:
      break;
  }
  showMessage(view.engine.timeScale() === 1 ? 'Real time' : `Time rate ${view.engine.timeScale()}x`, 2);
  emit('time-command', command);
}

/** Mirrors TimeToolBar::slotCurrentTime: system UTC clock to TDB. */
function setCurrentTime(): void {
  const now = new Date();
  const jd =
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()) /
      86400000) +
    2440587.5;
  setSimulationTime(utcToTdb(jd));
}

function utcToTdb(jdUtc: number): number {
  const wasm = (globalThis as { __celestiaAstro?: { UTCtoTDB(value: number): number } }).__celestiaAstro;
  if (wasm) return wasm.UTCtoTDB(jdUtc);
  return jdUtc;
}

// -------------------------------------------------------------- guides bar
//
// Text only buttons whose captions are the same key hints Celestia shows.

const guideButtons = [
  { id: 'guide-equatorial', text: 'Eq', tooltip: 'Equatorial coordinate grid', flag: 'equatorial' },
  { id: 'guide-galactic', text: 'Ga', tooltip: 'Galactic coordinate grid', flag: 'galactic' },
  { id: 'guide-ecliptic', text: 'Ec', tooltip: 'Ecliptic coordinate grid', flag: 'ecliptic' },
  { id: 'guide-horizon', text: 'Hz', tooltip: 'Horizontal coordinate grid', flag: 'horizon' },
  { id: 'guide-ecliptic-line', text: 'Ecl', tooltip: 'Ecliptic line', flag: 'eclipticLine' },
  { id: 'guide-markers', text: 'M', tooltip: 'Markers', flag: 'markers' },
  { id: 'guide-constellations', text: 'C', tooltip: 'Constellations', flag: 'constellations' },
  { id: 'guide-boundaries', text: 'B', tooltip: 'Constellation boundaries', flag: 'boundaries' },
  { id: 'guide-orbits', text: 'O', tooltip: 'Orbits', flag: 'orbits' },
  { id: 'guide-labels', text: 'L', tooltip: 'Labels', flag: 'labels' },
];

function guideState(flag: string): boolean {
  switch (flag) {
    case 'equatorial':
      return hasFlag(RenderFlags.ShowCelestialSphere);
    case 'galactic':
      return hasFlag(RenderFlags.ShowGalacticGrid);
    case 'ecliptic':
      return hasFlag(RenderFlags.ShowEclipticGrid);
    case 'horizon':
      return hasFlag(RenderFlags.ShowHorizonGrid);
    case 'eclipticLine':
      return hasFlag(RenderFlags.ShowEcliptic);
    case 'markers':
      return hasFlag(RenderFlags.ShowMarkers);
    case 'constellations':
      return hasFlag(RenderFlags.ShowDiagrams);
    case 'boundaries':
      return hasFlag(RenderFlags.ShowBoundaries);
    case 'orbits':
      return hasFlag(RenderFlags.ShowOrbits);
    case 'labels':
      return hasLabel(RenderLabels.StarLabels) || hasLabel(RenderLabels.PlanetLabels);
    default:
      return false;
  }
}

function guideToggle(flag: string): void {
  switch (flag) {
    case 'equatorial':
      setFlag(RenderFlags.ShowCelestialSphere, !hasFlag(RenderFlags.ShowCelestialSphere));
      break;
    case 'galactic':
      setFlag(RenderFlags.ShowGalacticGrid, !hasFlag(RenderFlags.ShowGalacticGrid));
      break;
    case 'ecliptic':
      setFlag(RenderFlags.ShowEclipticGrid, !hasFlag(RenderFlags.ShowEclipticGrid));
      break;
    case 'horizon':
      setFlag(RenderFlags.ShowHorizonGrid, !hasFlag(RenderFlags.ShowHorizonGrid));
      break;
    case 'eclipticLine':
      setFlag(RenderFlags.ShowEcliptic, !hasFlag(RenderFlags.ShowEcliptic));
      break;
    case 'markers':
      setFlag(RenderFlags.ShowMarkers, !hasFlag(RenderFlags.ShowMarkers));
      break;
    case 'constellations':
      setFlag(RenderFlags.ShowDiagrams, !hasFlag(RenderFlags.ShowDiagrams));
      break;
    case 'boundaries':
      setFlag(RenderFlags.ShowBoundaries, !hasFlag(RenderFlags.ShowBoundaries));
      break;
    case 'orbits':
      setFlag(RenderFlags.ShowOrbits, !hasFlag(RenderFlags.ShowOrbits));
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------ popup menus

// Only where the popup is and what fills it: the items are read from the menu
// model as it renders, so a check mark follows the state it stands for. Holding
// a copy instead made the popup show the state from when it was opened, which is
// why the tick only appeared after reopening it.
//
// A guide button names its submenu; a bookmark folder carries the folder itself,
// whose contents are rebuilt on every render.
const openSub = ref<{ id: string; x: number; y: number; folder: BookmarkFolder | null } | null>(null);

const orbitsItems = computed(() => buildOrbitsSubmenu().items ?? []);
const labelsItems = computed(() => buildLabelsSubmenu().items ?? []);

const openSubItems = computed<MenuItem[]>(() => {
  const sub = openSub.value;
  if (sub === null) return [];
  if (sub.folder) return folderMenuItems(sub.folder);
  return sub.id === 'guide-orbits' ? orbitsItems.value : labelsItems.value;
});

function openGuideSub(id: string, event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  openSub.value = { id, x: rect.left, y: rect.bottom, folder: null };
}

function onSubAction(id: string): void {
  props.onAction(id);
  // Qt hides a menu once one of its actions is triggered, the same as the
  // selection menu does.
  openSub.value = null;
}

// ---------------------------------------------------------- bookmark bar
//
// A bookmark button runs its URL; a folder button opens the folder's contents,
// which is BookmarkToolBar's QToolButton in InstantPopup mode.

const bookmarkButtons = computed(() => {
  const out: Array<{ id: string; title: string; description: string; folder: BookmarkFolder | null }> = [];
  for (const bar of bookmarks.toolbar) {
    for (const child of bar.children) {
      if (child.kind === 'bookmark') {
        // The bookmark: prefix is what the action handler dispatches on; the
        // same ids the Bookmarks menu builds are used here.
        out.push({ id: `bookmark:${child.id}`, title: child.title, description: child.description, folder: null });
      } else if (child.kind === 'folder') {
        out.push({ id: `folder:${child.folder.id}`, title: child.folder.title, description: child.folder.description, folder: child.folder });
      }
    }
  }
  return out;
});

/** What a folder holds, as menu items; a nested folder becomes a submenu. */
function folderMenuItems(folder: BookmarkFolder): MenuItem[] {
  const items: MenuItem[] = [];
  for (const child of folder.children) {
    if (child.kind === 'separator') {
      items.push({ kind: 'separator' });
    } else if (child.kind === 'folder') {
      items.push({ kind: 'submenu', label: child.folder.title, items: folderMenuItems(child.folder) });
    } else {
      items.push({ kind: 'action', id: `bookmark:${child.id}`, label: child.title });
    }
  }
  return items.length ? items : [{ kind: 'action', id: 'noop', label: '(empty)', disabled: true }];
}

function openFolderMenu(button: { id: string; folder: BookmarkFolder | null }, event: MouseEvent): void {
  if (button.folder === null || openSub.value?.id === button.id) {
    openSub.value = null;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  openSub.value = { id: button.id, x: rect.left, y: rect.bottom, folder: button.folder };
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest('.ui-toolbutton') || target.closest('.ui-menu')) return;
  openSub.value = null;
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));
</script>

<template>
  <div v-if="ui.showTimeToolBar" class="ui-toolbar" :title="t('Time')">
    <button
      v-for="button in timeButtons"
      :key="button.command"
      class="ui-toolbutton"
      :title="button.tooltip"
      @click="onTimeButton(button.command)"
    >
      <img :src="props.iconUrl(button.icon)" :alt="button.tooltip" />
    </button>
  </div>

  <div v-if="ui.showGuidesToolBar" class="ui-toolbar" :title="t('Guides')">
    <button
      v-for="button in guideButtons"
      :key="button.id"
      class="ui-toolbutton text-only"
      :class="{ checked: guideState(button.flag) }"
      :title="button.tooltip"
      @click="button.flag === 'orbits' || button.flag === 'labels' ? openGuideSub(button.id, $event) : guideToggle(button.flag)"
      @contextmenu.prevent="openGuideSub(button.id, $event)"
    >
      {{ button.text }}
    </button>
  </div>

  <div v-if="ui.showBookmarkToolBar" class="ui-toolbar" :title="t('Bookmark toolbar')">
    <button
      v-for="button in bookmarkButtons"
      :key="button.id"
      class="ui-toolbutton text-only"
      :class="{ checked: openSub?.id === button.id }"
      :title="button.description || button.title"
      @click="button.folder ? openFolderMenu(button, $event) : onAction(button.id)"
    >
      {{ button.title }}
    </button>
    <span v-if="bookmarkButtons.length === 0" class="ui-label ui-muted" style="font-size: 11px">no bookmarks</span>
  </div>

  <Teleport to="body">
    <MenuPopup
      v-if="openSub"
      :items="openSubItems"
      :x="openSub.x"
      :y="openSub.y"
      @action="onSubAction"
    />
  </Teleport>
</template>
