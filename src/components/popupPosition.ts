// Where a popup menu is drawn: the point it was asked for, moved back inside the
// window when the whole of it does not fit there.
//
// QMenu keeps its menus on the screen the same way, in QMenuPrivate::adjustedPos,
// and a menu with more rows than the window has is drawn against its top edge and
// scrolled, which is what Qt's scrollable menus do. The point itself stays the
// anchor, so a menu follows when the window is resized.

import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/** The gap a menu keeps from the window's edge. */
const MARGIN = 4;

export interface MenuPoint {
  left: number;
  top: number;
}

/** The place to draw a menu at, given the point it was asked for. */
function fitted(element: HTMLElement, anchor: MenuPoint): MenuPoint {
  return {
    left: Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - element.offsetWidth - MARGIN)),
    top: Math.max(MARGIN, Math.min(anchor.top, window.innerHeight - element.offsetHeight - MARGIN)),
  };
}

/**
 * The place a menu element is drawn at. It is measured once it is in the
 * document, and again when the point it was asked for, its own size or the
 * window's changes.
 */
export function useMenuPoint(element: Ref<HTMLElement | null>, anchor: () => MenuPoint): Ref<MenuPoint> {
  const placed = ref<MenuPoint>(anchor());
  const fit = (): void => {
    const target = element.value;
    if (target !== null) placed.value = fitted(target, anchor());
  };

  let observer: ResizeObserver | null = null;
  onMounted(() => {
    fit();
    observer = new ResizeObserver(fit);
    if (element.value !== null) observer.observe(element.value);
    window.addEventListener('resize', fit);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    window.removeEventListener('resize', fit);
  });
  watch(anchor, fit, { flush: 'post' });

  return placed;
}
