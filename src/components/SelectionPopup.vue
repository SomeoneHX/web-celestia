<script setup lang="ts">
// The selection context menu, ported from qtselectionpopup.cpp.
//
// Qt builds the menu around the Selection the core picked. That is not the same
// as the current selection, because a right click picks without selecting, and
// every action is the same two steps: set the core's selection, then send the
// key that performs the action -- slotCenterSelection is setSelection plus
// charEntered("c"), goto "g", follow "f", sync orbit "y".
//
// Only what the engine can actually do is offered. Qt's menu also carries the
// object's physical data and submenus for markers, alternate surfaces,
// reference vectors and child objects; those read the engine's own accessors
// (Universe::markObject, Body::getAlternateSurfaceNames, PlanetarySystem) rather
// than a catalogue kept outside it, so they come back when those are bound. The
// engine's HUD already draws the picked object's physical data on the viewport.

import { computed, onBeforeUnmount, onMounted } from 'vue';
import { showMessage, ui, viewport } from '@/store/app';
import type { SelectedObject } from '@/wasm/celestia_core.js';

const props = defineProps<{
  x: number;
  y: number;
  /** What the engine picked for this menu. */
  picked: SelectedObject;
}>();

const emit = defineEmits<{ (event: 'close'): void; (event: 'changed'): void }>();

const title = computed(() => props.picked.name);

/** Qt offers Sync Orbit for anything with an orbit: not a star, not deep sky. */
const offerSyncOrbit = computed(() => props.picked.type !== 'Star' && props.picked.type !== 'DeepSky');

function close(): void {
  emit('close');
}

function command(action: string): void {
  const view = viewport();

  switch (action) {
    case 'select':
      view?.engine.selectContextMenuObject();
      emit('changed');
      break;
    case 'center':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('c', 0);
      showMessage(`Centered ${title.value}`, 2);
      break;
    case 'goto':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('g', 0);
      showMessage(`Going to ${title.value}`, 2);
      break;
    case 'follow':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('f', 0);
      showMessage(`Following ${title.value}`, 2);
      break;
    case 'sync':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('y', 0);
      showMessage(`Syncing orbit with ${title.value}`, 2);
      break;
    case 'info':
      ui.showInfoBrowser = true;
      emit('changed');
      break;
    default:
      break;
  }

  // Qt hides a menu as soon as one of its actions is triggered, which is why
  // none of the popup's slots close it themselves.
  close();
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest('.qt-menu')) return;
  close();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div
    class="qt-menu"
    :style="{ left: `${x}px`, top: `${y}px`, minWidth: '210px', position: 'fixed' }"
    @contextmenu.prevent
    @pointerdown.stop
    @pointerup.stop
    @click.stop
  >
    <div class="qt-menu-item" style="font-weight: 600" @pointerdown.stop="close()">
      <span class="label">{{ title }}</span>
    </div>

    <div class="qt-menu-separator" />

    <div class="qt-menu-item" @pointerdown.stop="command('select')"><span class="label">Select</span></div>
    <div class="qt-menu-item" @pointerdown.stop="command('center')"><span class="label">Center</span></div>
    <div class="qt-menu-item" @pointerdown.stop="command('goto')"><span class="label">Goto</span></div>
    <div class="qt-menu-item" @pointerdown.stop="command('follow')"><span class="label">Follow</span></div>
    <div v-if="offerSyncOrbit" class="qt-menu-item" @pointerdown.stop="command('sync')">
      <span class="label">Sync Orbit</span>
    </div>
    <div class="qt-menu-item" @pointerdown.stop="command('info')"><span class="label">Info</span></div>
  </div>
</template>
