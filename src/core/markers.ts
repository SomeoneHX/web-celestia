// User placed markers, mirroring engine::Marker and the MarkerRepresentation
// that the selection popup's Mark submenu creates.

import { Selection } from './selection';
import type { Vec3, Vec3 as Vec3Type } from './math';

export enum MarkerSymbol {
  Diamond = 'Diamond',
  Triangle = 'Triangle',
  Square = 'Square',
  FilledSquare = 'Filled Square',
  Plus = 'Plus',
  X = 'X',
  LeftArrow = 'Left Arrow',
  RightArrow = 'Right Arrow',
  UpArrow = 'Up Arrow',
  DownArrow = 'Down Arrow',
  Circle = 'Circle',
  Disk = 'Disk',
  Crosshair = 'Crosshair',
}

export const MARKER_SYMBOLS: MarkerSymbol[] = [
  MarkerSymbol.Diamond,
  MarkerSymbol.Triangle,
  MarkerSymbol.Square,
  MarkerSymbol.FilledSquare,
  MarkerSymbol.Plus,
  MarkerSymbol.X,
  MarkerSymbol.LeftArrow,
  MarkerSymbol.RightArrow,
  MarkerSymbol.UpArrow,
  MarkerSymbol.DownArrow,
  MarkerSymbol.Circle,
  MarkerSymbol.Disk,
  MarkerSymbol.Crosshair,
];

export interface Marker {
  selection: Selection;
  symbol: MarkerSymbol;
  /** Size in pixels, matching the MarkerRepresentation size in points. */
  size: number;
  color: [number, number, number, number];
  /** Layer index; the popup uses layer 1 and the browsers use layer 0. */
  layer: number;
  label: boolean;
  /** Cached scene position, refreshed each frame. */
  scenePosition: Vec3Type;
}

export class MarkerStore {
  private readonly markers: Marker[] = [];

  mark(selection: Selection, symbol: MarkerSymbol, size: number, color: [number, number, number, number], layer: number, label = false): void {
    const existing = this.markers.findIndex((m) => m.selection.equals(selection) && m.layer === layer);
    const marker: Marker = {
      selection: selection.clone(),
      symbol,
      size,
      color,
      layer,
      label,
      scenePosition: { x: 0, y: 0, z: 0 },
    };
    if (existing >= 0) this.markers[existing] = marker;
    else this.markers.push(marker);
  }

  unmark(selection: Selection, layer: number): void {
    const index = this.markers.findIndex((m) => m.selection.equals(selection) && m.layer === layer);
    if (index >= 0) this.markers.splice(index, 1);
  }

  unmarkAll(): void {
    this.markers.length = 0;
  }

  isMarked(selection: Selection, layer: number): boolean {
    return this.markers.some((m) => m.selection.equals(selection) && m.layer === layer);
  }

  all(): readonly Marker[] {
    return this.markers;
  }
}
