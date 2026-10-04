// A Qt style menu: a bar item that opens a popup list.
//
// The item model mirrors QAction: a label with an optional check state, an
// optional icon, an optional accelerator string and an optional submenu.
//
// Labels are translated where they are built. Celestia's own front end calls _()
// on each of them and the catalogue carries those strings, so the shell asks the
// same catalogue; a label Celestia has no entry for comes back unchanged, which
// is what gettext does and is why inventing translations here would be wrong.

import { t } from '@/store/app';

export interface MenuItem {
  kind: 'action' | 'separator' | 'submenu';
  id?: string;
  label?: string;
  accelerator?: string;
  icon?: string;
  checkable?: boolean;
  checked?: boolean;
  disabled?: boolean;
  items?: MenuItem[];
  /** Renders the label bold, which QMenu does for the default action. */
  bold?: boolean;
}

export const action = (
  id: string,
  label: string,
  options: Omit<MenuItem, 'kind' | 'id' | 'label'> = {},
): MenuItem => ({ kind: 'action', id, label: t(label), ...options });

export const checkableAction = (
  id: string,
  label: string,
  checked: boolean,
  options: Omit<MenuItem, 'kind' | 'id' | 'label' | 'checkable' | 'checked'> = {},
): MenuItem => ({ kind: 'action', id, label: t(label), checkable: true, checked, ...options });

export const submenu = (label: string, items: MenuItem[], options: Omit<MenuItem, 'kind' | 'label' | 'items'> = {}): MenuItem => ({
  kind: 'submenu',
  label: t(label),
  items,
  ...options,
});

export const separator = (): MenuItem => ({ kind: 'separator' });

/**
 * Accelerator strings, taken from the setShortcut and setShortcuts calls in
 * qtcelestiaactions.cpp and from the key handling in CelestiaCore::charEntered.
 */
export const ACCELERATORS = {
  grabImage: 'F10',
  captureVideo: 'Shift+F10',
  copyImage: 'Ctrl+Shift+C',
  copyUrl: 'Ctrl+C',
  pasteUrl: 'Ctrl+V',
  fullScreen: 'Alt+Enter',
  nebulae: '^',
  nightSideLights: 'Ctrl+L',
  atmospheres: 'Ctrl+A',
  eclipseShadows: 'Ctrl+E',
  autoMagnitude: 'Ctrl+Y',
  moreStars: ']',
  fewerStars: '[',
  exit: 'Ctrl+Q',
  splitVertical: 'Ctrl+U',
  splitHorizontal: 'Ctrl+R',
  cycleView: 'Tab',
  singleView: 'Ctrl+D',
  deleteView: 'Delete',
  customFps: 'Ctrl+`',
} as const;
