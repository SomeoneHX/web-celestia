<script setup lang="ts">
// A Qt style menu bar with popup menus.
//
// The whole bar is one component: the top level items open popups that can nest
// submenus, matching how QMenuBar and QMenu behave. Icons are resolved against
// the Qt action icons copied from src/celestia/qt/data.

import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import type { MenuItem } from './menuModel';
import { useMenuPoint } from './popupPosition';

const props = defineProps<{
  menus: Array<{ id: string; label: string; items: MenuItem[] }>;
  iconUrl?: (name: string) => string;
}>();

const emit = defineEmits<{ (event: 'action', id: string): void }>();

const openMenu = ref<string | null>(null);
const openSubmenu = ref<string | null>(null);
const barRef = ref<HTMLDivElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const submenuRef = ref<HTMLElement | null>(null);
const menuPosition = ref({ left: 0, top: 0 });
const submenuPosition = ref({ left: 0, top: 0 });
const menuPoint = useMenuPoint(menuRef, () => menuPosition.value);
const submenuPoint = useMenuPoint(submenuRef, () => submenuPosition.value);
const hoveredId = ref<string | null>(null);

function toggleMenu(id: string, event: MouseEvent): void {
  if (openMenu.value === id) {
    close();
    return;
  }
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  menuPosition.value = { left: rect.left, top: rect.bottom };
  openMenu.value = id;
  openSubmenu.value = null;
}

function hoverMenu(id: string, event: MouseEvent): void {
  if (openMenu.value === null || openMenu.value === id) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  menuPosition.value = { left: rect.left, top: rect.bottom };
  openMenu.value = id;
  openSubmenu.value = null;
}

function openSub(item: MenuItem, event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  submenuPosition.value = { left: rect.right - 4, top: rect.top - 4 };
  openSubmenu.value = item.label ?? null;
}

function close(): void {
  openMenu.value = null;
  openSubmenu.value = null;
}

function trigger(item: MenuItem): void {
  if (item.disabled) return;
  if (item.kind === 'submenu') return;
  if (item.id) emit('action', item.id);
  close();
}

/**
 * Renders a label the way Qt does: the ampersand marks a mnemonic and is not
 * shown, and the character after it is underlined.
 */
function mnemonicParts(text: string | undefined): Array<{ text: string; underline: boolean }> {
  const source = (text ?? '').replace(/&&/g, '\u0000');
  const parts: Array<{ text: string; underline: boolean }> = [];
  let buffer = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '&' && i + 1 < source.length) {
      if (buffer) parts.push({ text: buffer, underline: false });
      buffer = '';
      parts.push({ text: source[i + 1].replace('\u0000', '&'), underline: true });
      i++;
    } else {
      buffer += ch.replace('\u0000', '&');
    }
  }
  if (buffer) parts.push({ text: buffer, underline: false });
  return parts;
}

const activeItems = computed<MenuItem[]>(() => {
  if (!openMenu.value) return [];
  return props.menus.find((m) => m.id === openMenu.value)?.items ?? [];
});

const activeSubmenuItems = computed<MenuItem[]>(() => {
  if (!openSubmenu.value) return [];
  const found = activeItems.value.find((i) => i.kind === 'submenu' && i.label === openSubmenu.value);
  return found?.items ?? [];
});

const label = (item: MenuItem): string => (item.label ?? '').replace(/&/g, '');

function iconSrc(name?: string): string | null {
  if (!name) return null;
  // A bookmark's icon is the frame it captured, which is a URL already.
  if (name.startsWith('data:') || name.startsWith('blob:')) return name;
  return props.iconUrl ? props.iconUrl(name) : `/icons/${name}`;
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement;
  if (barRef.value?.contains(target)) return;
  if (target.closest('.ui-menu')) return;
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
  <div ref="barRef" class="ui-menubar">
    <div
      v-for="menu in menus"
      :key="menu.id"
      class="ui-menubar-item"
      :class="{ open: openMenu === menu.id }"
      @pointerdown.stop="toggleMenu(menu.id, $event)"
      @mouseenter="hoverMenu(menu.id, $event)"
    >
      <span><template v-for="(part, index) in mnemonicParts(menu.label)" :key="index"><u v-if="part.underline">{{ part.text }}</u><template v-else>{{ part.text }}</template></template></span>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="openMenu"
      ref="menuRef"
      class="ui-menu"
      :style="{ left: `${menuPoint.left}px`, top: `${menuPoint.top}px` }"
      @contextmenu.prevent
    >
      <template v-for="(item, index) in activeItems" :key="`${openMenu}-${index}`">
        <div v-if="item.kind === 'separator'" class="ui-menu-separator" />
        <div
          v-else
          class="ui-menu-item"
          :class="{ disabled: item.disabled }"
          @pointerdown.stop="trigger(item)"
          @mouseenter="item.kind === 'submenu' ? openSub(item, $event) : (openSubmenu = null)"
        >
          <span v-if="item.checkable" class="check">{{ item.checked ? '✓' : '' }}</span>
          <img v-else-if="item.icon" class="icon" :src="iconSrc(item.icon) ?? ''" alt="" />
          <span class="label" :style="{ fontWeight: item.bold ? 600 : 400 }"><template v-for="(part, partIndex) in mnemonicParts(item.label)" :key="partIndex"><u v-if="part.underline">{{ part.text }}</u><template v-else>{{ part.text }}</template></template></span>
          <span v-if="item.accelerator" class="accelerator">{{ item.accelerator }}</span>
          <span v-if="item.kind === 'submenu'" class="arrow">▶</span>
        </div>
      </template>
    </div>

    <div
      v-if="openMenu && openSubmenu && activeSubmenuItems.length > 0"
      ref="submenuRef"
      class="ui-menu"
      :style="{ left: `${submenuPoint.left}px`, top: `${submenuPoint.top}px` }"
    >
      <template v-for="(item, index) in activeSubmenuItems" :key="`sub-${index}`">
        <div v-if="item.kind === 'separator'" class="ui-menu-separator" />
        <div
          v-else
          class="ui-menu-item"
          :class="{ disabled: item.disabled }"
          @pointerdown.stop="trigger(item)"
        >
          <span v-if="item.checkable" class="check">{{ item.checked ? '✓' : '' }}</span>
          <img v-else-if="item.icon" class="icon" :src="iconSrc(item.icon) ?? ''" alt="" />
          <span class="label"><template v-for="(part, partIndex) in mnemonicParts(item.label)" :key="partIndex"><u v-if="part.underline">{{ part.text }}</u><template v-else>{{ part.text }}</template></template></span>
          <span v-if="item.accelerator" class="accelerator">{{ item.accelerator }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>
