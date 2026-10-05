<script setup lang="ts">
// A popup list of menu items at a fixed position.
//
// A submenu item opens a nested popup beside itself, the way QMenu nests, and
// the component renders itself for that, so a bookmark folder tree of any depth
// comes out. The items are read from the prop on every render, so a check mark
// follows the state it stands for.

import { computed, ref } from 'vue';
import type { MenuItem } from './menuModel';

const props = defineProps<{ items: MenuItem[]; x: number; y: number }>();
const emit = defineEmits<{ (event: 'action', id: string): void }>();

// Only where the nested popup is and which item opened it: its items are looked
// up in the current list so they stay the ones being shown.
const nested = ref<{ label: string; x: number; y: number } | null>(null);

const nestedItems = computed<MenuItem[]>(() => {
  if (nested.value === null) return [];
  const found = props.items.find((item) => item.kind === 'submenu' && item.label === nested.value?.label);
  return found?.items ?? [];
});

function onItemEnter(item: MenuItem, event: MouseEvent): void {
  if (item.kind !== 'submenu') {
    nested.value = null;
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  nested.value = { label: item.label ?? '', x: rect.right - 4, y: rect.top - 4 };
}

function trigger(item: MenuItem): void {
  if (item.disabled || item.kind === 'submenu' || !item.id) return;
  emit('action', item.id);
}
</script>

<template>
  <div class="ui-menu" :style="{ left: `${x}px`, top: `${y}px` }" @contextmenu.prevent>
    <template v-for="(item, index) in items" :key="index">
      <div v-if="item.kind === 'separator'" class="ui-menu-separator" />
      <div
        v-else
        class="ui-menu-item"
        :class="{ disabled: item.disabled }"
        @pointerdown.stop="trigger(item)"
        @mouseenter="onItemEnter(item, $event)"
      >
        <span v-if="item.checkable" class="check">{{ item.checked ? '✓' : '' }}</span>
        <span class="label">{{ item.label }}</span>
        <span v-if="item.kind === 'submenu'" class="arrow">▶</span>
      </div>
    </template>
    <Teleport to="body">
      <MenuPopup
        v-if="nested && nestedItems.length > 0"
        :items="nestedItems"
        :x="nested.x"
        :y="nested.y"
        @action="emit('action', $event)"
      />
    </Teleport>
  </div>
</template>
