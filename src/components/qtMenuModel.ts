// A Qt style menu: a bar item that opens a popup list.
//
// The item model mirrors QAction: a label with an optional check state, an
// optional icon, an optional accelerator string and an optional submenu.

export interface QtMenuItem {
  kind: 'action' | 'separator' | 'submenu';
  id?: string;
  label?: string;
  accelerator?: string;
  icon?: string;
  checkable?: boolean;
  checked?: boolean;
  disabled?: boolean;
  items?: QtMenuItem[];
  /** Renders the label bold, which QMenu does for the default action. */
  bold?: boolean;
}

export const action = (
  id: string,
  label: string,
  options: Omit<QtMenuItem, 'kind' | 'id' | 'label'> = {},
): QtMenuItem => ({ kind: 'action', id, label, ...options });

export const checkableAction = (
  id: string,
  label: string,
  checked: boolean,
  options: Omit<QtMenuItem, 'kind' | 'id' | 'label' | 'checkable' | 'checked'> = {},
): QtMenuItem => ({ kind: 'action', id, label, checkable: true, checked, ...options });

export const submenu = (label: string, items: QtMenuItem[], options: Omit<QtMenuItem, 'kind' | 'label' | 'items'> = {}): QtMenuItem => ({
  kind: 'submenu',
  label,
  items,
  ...options,
});

export const separator = (): QtMenuItem => ({ kind: 'separator' });

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
