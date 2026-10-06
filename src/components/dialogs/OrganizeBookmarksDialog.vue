<script setup lang="ts">
// Organize Bookmarks, ported from OrganizeBookmarksDialog (qtbookmark.cpp).
//
// One tree holds both roots, with the Qt view's two columns and its header
// shown. A row is a folder, a bookmark or a separator; the buttons act on the
// current selection, which is also what a drag moves.

import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import {
  bookmarkFolderDescription, bookmarkFolderTitle, bookmarkRoots, nextBookmarkId, t,
} from '@/store/app';
import type { BookmarkFolder, BookmarkNode } from '@/store/app';

const props = defineProps<{ iconUrl: (name: string) => string }>();
const emit = defineEmits<{ (event: 'close'): void }>();

// -------------------------------------------------------------------- rows

interface TreeRow {
  /** The row's node; a top level row wraps its root folder in one. */
  node: BookmarkNode;
  /** A folder id, or a bookmark's or separator's own id. */
  id: string;
  depth: number;
  /** The folder the row sits in, or null for the two top level rows. */
  parent: BookmarkFolder | null;
  /** The row's place in its parent's children. */
  index: number;
  /** A folder's contents, empty for anything else. */
  children: BookmarkNode[];
  /** Whether the contents are on show; only a folder with some can be open. */
  expanded: boolean;
}

/**
 * Qt expands the bookmark menu and the bookmark toolbar when the dialog opens
 * and leaves every other folder shut, which is the state this starts in.
 */
const expandedIds = reactive(new Set<string>(bookmarkRoots().map((folder) => folder.id)));

function nodeId(node: BookmarkNode): string {
  return node.kind === 'folder' ? node.folder.id : node.id;
}

function appendRow(
  node: BookmarkNode,
  parent: BookmarkFolder | null,
  index: number,
  depth: number,
  out: TreeRow[],
  visibleOnly: boolean,
): void {
  const folder = node.kind === 'folder' ? node.folder : null;
  const children = folder === null ? [] : folder.children;
  const expanded = children.length > 0 && expandedIds.has(nodeId(node));
  out.push({ node, id: nodeId(node), depth, parent, index, children, expanded });
  if (folder === null) return;
  if (visibleOnly && !expanded) return;
  children.forEach((child, at) => appendRow(child, folder, at, depth + 1, out, visibleOnly));
}

function walk(visibleOnly: boolean): TreeRow[] {
  const out: TreeRow[] = [];
  for (const root of bookmarkRoots()) {
    appendRow({ kind: 'folder', folder: root }, null, -1, 0, out, visibleOnly);
  }
  return out;
}

/** The rows on show, which leaves out what a shut folder holds. */
const rows = computed(() => walk(true));

/** Every row, shut or not: a selection outlives collapsing the folder it is in. */
const everyRow = computed(() => walk(false));

function rowTitle(row: TreeRow): string {
  if (row.node.kind === 'folder') return bookmarkFolderTitle(row.node.folder);
  // BookmarkTreeModel::data draws a separator as a run of dashes.
  if (row.node.kind === 'separator') return '-'.repeat(40);
  return row.node.title;
}

function rowDescription(row: TreeRow): string {
  if (row.node.kind === 'separator') return '';
  return row.node.kind === 'folder'
    ? bookmarkFolderDescription(row.node.folder)
    : row.node.description;
}

function rowIcon(row: TreeRow): string {
  if (row.node.kind === 'folder') return props.iconUrl('folder.svg');
  // A bookmark draws with the frame it was made from, as DecorationRole gives it.
  if (row.node.kind === 'bookmark' && row.node.icon !== undefined && row.node.icon !== '') return row.node.icon;
  return props.iconUrl('application-bookmark.png');
}

function twisty(row: TreeRow): string {
  if (row.children.length === 0) return '';
  return row.expanded ? '▼' : '▶';
}

function toggle(row: TreeRow): void {
  if (row.children.length === 0) return;
  if (expandedIds.has(row.id)) expandedIds.delete(row.id);
  else expandedIds.add(row.id);
}

// --------------------------------------------------------------- selection

const selectedId = ref<string | null>(null);
const hoveredId = ref<string | null>(null);

const selectedRow = computed(() => everyRow.value.find((row) => row.id === selectedId.value) ?? null);

/** An item with no parent, which the two top level rows have, cannot be removed. */
const canRemove = computed(() => {
  const row = selectedRow.value;
  return row !== null && row.parent !== null;
});

function cellClass(row: TreeRow): Record<string, boolean> {
  return {
    hovered: hoveredId.value === row.id,
    selected: selectedId.value === row.id,
    'drop-before': drop.value?.id === row.id && drop.value.where === 'before',
    'drop-after': drop.value?.id === row.id && drop.value.where === 'after',
    'drop-into': drop.value?.id === row.id && drop.value.where === 'into',
  };
}

/**
 * The cell an event reached and the row it belongs to. The handlers sit on the
 * tree rather than on each of the row's two cells.
 */
function hitCell(event: Event): { cell: HTMLElement; row: TreeRow } | null {
  const cell = (event.target as Element | null)?.closest('[data-row]');
  if (!(cell instanceof HTMLElement)) return null;
  const row = rows.value.find((candidate) => candidate.id === cell.dataset.row) ?? null;
  return row === null ? null : { cell, row };
}

function onPointerDown(event: PointerEvent): void {
  // The twisty opens and shuts a folder and leaves the selection where it is.
  if ((event.target as Element | null)?.closest('.twisty') != null) return;
  const hit = hitCell(event);
  if (hit !== null) selectedId.value = hit.row.id;
}

function onPointerOver(event: PointerEvent): void {
  const hit = hitCell(event);
  hoveredId.value = hit === null ? null : hit.row.id;
}

function onPointerOut(event: PointerEvent): void {
  const hit = hitCell(event);
  if (hit === null) return;
  const to = event.relatedTarget as Node | null;
  if (to !== null && hit.cell.contains(to)) return;
  if (hoveredId.value === hit.row.id) hoveredId.value = null;
}

function onDoubleClick(event: MouseEvent): void {
  if ((event.target as Element | null)?.closest('.twisty') != null) return;
  const hit = hitCell(event);
  if (hit !== null) startEdit(hit.row, hit.cell.dataset.column === '1' ? 1 : 0);
}

// ------------------------------------------------------------ editing cells

const editing = ref<{ id: string; column: 0 | 1; text: string } | null>(null);

/** Qt lets a title and a description be edited, and a separator be neither. */
function startEdit(row: TreeRow, column: 0 | 1): void {
  if (row.node.kind === 'separator') return;
  if (editing.value?.id === row.id && editing.value.column === column) return;
  // Qt commits an open editor when another one opens.
  commitEdit();
  editing.value = { id: row.id, column, text: column === 0 ? rowTitle(row) : rowDescription(row) };
}

function commitEdit(): void {
  const edit = editing.value;
  editing.value = null;
  if (edit === null) return;
  const row = everyRow.value.find((candidate) => candidate.id === edit.id);
  if (row === undefined) return;
  if (row.node.kind === 'folder') {
    if (edit.column === 0) row.node.folder.title = edit.text;
    else row.node.folder.description = edit.text;
  } else if (row.node.kind === 'bookmark') {
    if (edit.column === 0) row.node.title = edit.text;
    else row.node.description = edit.text;
  }
}

function onEditorInput(event: Event): void {
  if (editing.value !== null) editing.value.text = (event.target as HTMLInputElement).value;
}

/** Qt opens the editor on the cell's text, all of it selected. */
function focusEditor(element: unknown): void {
  if (element instanceof HTMLInputElement) {
    element.focus();
    element.select();
  }
}

// ----------------------------------------------------------------- buttons

/**
 * Adds a node to the current selection. A folder takes it as its first child
 * when that row is open or is a top level row; anything else puts the node right
 * after the row, which is the rule the dialog's two slots share.
 */
function insertAtSelection(node: BookmarkNode): void {
  const row = selectedRow.value;
  if (row === null) return;
  const folder = row.node.kind === 'folder' ? row.node.folder : null;
  if (folder !== null && (row.expanded || row.depth === 0)) {
    folder.children.unshift(node);
    return;
  }
  if (row.parent !== null) row.parent.children.splice(row.index + 1, 0, node);
}

function newFolder(): void {
  insertAtSelection({
    kind: 'folder',
    folder: { id: nextBookmarkId(), title: t('New Folder'), description: '', folded: true, children: [] },
  });
}

function newSeparator(): void {
  insertAtSelection({ kind: 'separator', id: nextBookmarkId() });
}

function removeItem(): void {
  const row = selectedRow.value;
  if (row === null || row.parent === null) return;
  row.parent.children.splice(row.index, 1);
  selectedId.value = null;
}

// -------------------------------------------------------------------- drag

const draggedId = ref<string | null>(null);
const drop = ref<{ id: string; where: 'before' | 'after' | 'into' } | null>(null);

function draggedRow(): TreeRow | null {
  return everyRow.value.find((row) => row.id === draggedId.value) ?? null;
}

/** Whether this folder is the given one or sits inside it. */
function holdsFolder(candidate: BookmarkFolder, folder: BookmarkFolder): boolean {
  if (candidate.id === folder.id) return true;
  return folder.children.some((child) => child.kind === 'folder' && holdsFolder(candidate, child.folder));
}

/**
 * Where a drop on this cell lands. The middle of a folder row is that folder's
 * contents, which Qt appends to; anywhere else is beside the row, in the folder
 * the row belongs to. Nothing drops into itself or into its own contents.
 */
function dropTarget(row: TreeRow, cell: HTMLElement, event: DragEvent): { where: 'before' | 'after' | 'into'; folder: BookmarkFolder; index: number } | null {
  const dragged = draggedRow();
  if (dragged === null || dragged.id === row.id) return null;

  const box = cell.getBoundingClientRect();
  const offset = event.clientY - box.top;
  const into = row.node.kind === 'folder' && offset > box.height * 0.25 && offset < box.height * 0.75;
  const where = into ? 'into' : offset < box.height / 2 ? 'before' : 'after';

  const folder = into && row.node.kind === 'folder' ? row.node.folder : row.parent;
  if (folder === null) return null;
  if (dragged.node.kind === 'folder' && holdsFolder(folder, dragged.node.folder)) return null;
  return {
    where,
    folder,
    index: where === 'into' ? folder.children.length : row.index + (where === 'after' ? 1 : 0),
  };
}

function onDragStart(event: DragEvent): void {
  const hit = hitCell(event);
  if (hit === null || event.dataTransfer === null) return;
  draggedId.value = hit.row.id;
  drop.value = null;
  event.dataTransfer.effectAllowed = 'move';
  // A payload is what starts the drag in Safari and Firefox.
  event.dataTransfer.setData('text/plain', hit.row.id);
}

function onDragOver(event: DragEvent): void {
  const hit = hitCell(event);
  if (hit === null) {
    drop.value = null;
    return;
  }
  const target = dropTarget(hit.row, hit.cell, event);
  if (target === null) {
    drop.value = null;
    return;
  }
  event.preventDefault();
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
  drop.value = { id: hit.row.id, where: target.where };
}

function onDragLeave(event: DragEvent): void {
  const to = event.relatedTarget as Node | null;
  if (to !== null && (event.currentTarget as HTMLElement).contains(to)) return;
  drop.value = null;
}

function onDrop(event: DragEvent): void {
  const hit = hitCell(event);
  const dragged = draggedRow();
  const target = hit === null ? null : dropTarget(hit.row, hit.cell, event);
  draggedId.value = null;
  drop.value = null;
  if (dragged === null || target === null || dragged.parent === null) return;
  event.preventDefault();

  const siblings = dragged.parent.children;
  const [node] = siblings.splice(dragged.index, 1);
  if (node === undefined) return;
  // Lifting the node out shifts what follows it, so a move within one folder
  // lands one place short of the row the pointer named.
  const index = target.folder === dragged.parent && dragged.index < target.index
    ? target.index - 1
    : target.index;
  target.folder.children.splice(index, 0, node);
}

function endDrag(): void {
  draggedId.value = null;
  drop.value = null;
}

// ---------------------------------------------------------------- keyboard

const treeRef = ref<HTMLDivElement | null>(null);

// Qt gives the tree view the focus as the dialog opens, so its keys work at once.
onMounted(() => treeRef.value?.focus());

/** How many rows the tree's height holds, which is what a page key moves by. */
function pageRows(): number {
  const tree = treeRef.value;
  const cell = tree?.querySelector('.cell') ?? null;
  if (tree === null || cell === null) return 1;
  return Math.max(1, Math.floor(tree.clientHeight / cell.getBoundingClientRect().height));
}

/** Moves the selection to a row and scrolls it into view, as the arrow keys do. */
function moveTo(index: number): void {
  const rows_ = rows.value;
  if (rows_.length === 0) return;
  const row = rows_[Math.max(0, Math.min(rows_.length - 1, index))];
  selectedId.value = row.id;
  void nextTick(() => {
    treeRef.value?.querySelector(`[data-row="${row.id}"]`)?.scrollIntoView({ block: 'nearest' });
  });
}

/**
 * The keys QTreeView answers: the arrows walk the visible rows, left and right
 * open and shut a folder and step out to its parent, and F2 opens the editor.
 */
function onKeyDown(event: KeyboardEvent): void {
  // An open editor takes the keys, as Qt's does.
  if (editing.value !== null) return;
  const row = selectedRow.value;
  // The selection is looked up among every row, so the visible list is where its
  // place in the walk is read from.
  const index = row === null ? -1 : rows.value.findIndex((candidate) => candidate.id === row.id);
  const open = row !== null && row.children.length > 0;

  switch (event.key) {
    case 'ArrowDown': moveTo(index + 1); break;
    case 'ArrowUp': moveTo(index - 1); break;
    case 'Home': moveTo(0); break;
    case 'End': moveTo(rows.value.length - 1); break;
    case 'PageDown': moveTo(index + pageRows()); break;
    case 'PageUp': moveTo(index - pageRows()); break;
    case 'ArrowRight':
      if (row === null) return;
      if (open && !row.expanded) toggle(row);
      else if (open) moveTo(index + 1);
      else return;
      break;
    case 'ArrowLeft': {
      if (row === null) return;
      if (open && row.expanded) {
        toggle(row);
        break;
      }
      const parent = row.parent;
      if (parent === null) return;
      moveTo(rows.value.findIndex((candidate) => candidate.id === parent.id));
      break;
    }
    case 'F2':
      if (row !== null) startEdit(row, 0);
      break;
    default:
      return;
  }
  // The window hands an unclaimed key to the engine, so the tree keeps these.
  event.preventDefault();
  event.stopPropagation();
}
</script>

<template>
  <div class="ui-dialog-backdrop" @pointerdown.self="emit('close')">
    <div class="ui-dialog" style="width: 581px; height: 480px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Organize Bookmarks')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="emit('close')">✕</button>
      </div>

      <div class="ui-dialog-body" style="display: flex; flex-direction: column">
        <div
          class="ui-bookmark-tree"
          ref="treeRef"
          tabindex="0"
          @keydown="onKeyDown"
          @pointerdown="onPointerDown"
          @pointerover="onPointerOver"
          @pointerout="onPointerOut"
          @dblclick="onDoubleClick"
          @dragstart="onDragStart"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @dragend="endDrag"
        >
          <div class="head">{{t('Title')}}</div>
          <div class="head">{{t('Description')}}</div>

          <template v-for="row in rows" :key="row.id">
            <div class="cell" :class="cellClass(row)" :data-row="row.id" data-column="0" :draggable="row.parent !== null">
              <span class="indent" :style="{ width: `${row.depth * 16}px` }" />
              <span class="twisty" @click="toggle(row)">{{ twisty(row) }}</span>
              <img v-if="row.node.kind !== 'separator'" :src="rowIcon(row)" alt="" />
              <input
                v-if="editing?.id === row.id && editing?.column === 0"
                :ref="focusEditor"
                class="ui-input editor"
                :value="editing?.text ?? ''"
                @input="onEditorInput"
                @keydown.enter.prevent="commitEdit"
                @keydown.esc.prevent="editing = null"
                @blur="commitEdit"
              />
              <span v-else class="text">{{ rowTitle(row) }}</span>
            </div>

            <div class="cell" :class="cellClass(row)" :data-row="row.id" data-column="1" :draggable="row.parent !== null">
              <input
                v-if="editing?.id === row.id && editing?.column === 1"
                :ref="focusEditor"
                class="ui-input editor"
                :value="editing?.text ?? ''"
                @input="onEditorInput"
                @keydown.enter.prevent="commitEdit"
                @keydown.esc.prevent="editing = null"
                @blur="commitEdit"
              />
              <span v-else class="text">{{ rowDescription(row) }}</span>
            </div>
          </template>
        </div>

        <div class="ui-hbox" style="margin-top: 8px">
          <button class="ui-button" @click="newFolder">{{t('New Folder')}}</button>
          <button class="ui-button" @click="newSeparator">{{t('New Separator')}}</button>
          <button class="ui-button" :disabled="!canRemove" @click="removeItem">{{t('Remove Item')}}</button>
          <span class="ui-spacer" />
        </div>
      </div>

      <div class="ui-dialog-buttons">
        <button class="ui-button default" @click="emit('close')">Ok</button>
      </div>
    </div>
  </div>
</template>
