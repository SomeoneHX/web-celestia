// A selection, mirroring engine::Selection.

import type { Star } from './star';
import type { DeepSkyObject } from './dso';
import type { Body } from './body';
import type { Location } from './locations';

export type SelectionKind = 'none' | 'star' | 'deepsky' | 'body' | 'location';

export class Selection {
  body: Body | null = null;
  star: Star | null = null;
  deepsky: DeepSkyObject | null = null;
  location: Location | null = null;

  static empty(): Selection {
    return new Selection();
  }

  static forBody(body: Body): Selection {
    const s = new Selection();
    s.body = body;
    return s;
  }

  static forStar(star: Star): Selection {
    const s = new Selection();
    s.star = star;
    return s;
  }

  static forDeepSky(dso: DeepSkyObject): Selection {
    const s = new Selection();
    s.deepsky = dso;
    return s;
  }

  static forLocation(location: Location): Selection {
    const s = new Selection();
    s.location = location;
    return s;
  }

  get kind(): SelectionKind {
    if (this.body) return 'body';
    if (this.star) return 'star';
    if (this.deepsky) return 'deepsky';
    if (this.location) return 'location';
    return 'none';
  }

  get isEmpty(): boolean {
    return !this.body && !this.star && !this.deepsky && !this.location;
  }

  clone(): Selection {
    const s = new Selection();
    s.body = this.body;
    s.star = this.star;
    s.deepsky = this.deepsky;
    s.location = this.location;
    return s;
  }

  equals(other: Selection): boolean {
    return (
      this.body === other.body &&
      this.star === other.star &&
      this.deepsky === other.deepsky &&
      this.location === other.location
    );
  }

  /** Radius in kilometres, used to frame the camera and size the selection box. */
  get radius(): number {
    if (this.body) return this.body.boundingRadius;
    if (this.star) return 1;
    if (this.deepsky) return 1;
    if (this.location) return 1;
    return 0;
  }

  /** Display name, following Celestia's fallback order. */
  getName(): string {
    if (this.body) return this.body.localizedName;
    if (this.star) return this.star.names?.n || (this.star.names?.b ? `${this.star.names.b} ${this.star.names.c}` : '') || `HIP ${this.star.index}`;
    if (this.deepsky) return this.deepsky.designation || this.deepsky.name || this.deepsky.id;
    if (this.location) return this.location.name;
    return '';
  }

  /** Catalogue type label shown in the browser's Type column. */
  getTypeName(): string {
    if (this.body) {
      const b = this.body;
      if (b.classification & 0x01) return 'Planet';
      if (b.classification & 0x02) return 'Dwarf planet';
      if (b.classification & 0x04) return 'Moon';
      if (b.classification & 0x08) return 'Minor moon';
      if (b.classification & 0x10) return 'Asteroid';
      if (b.classification & 0x20) return 'Comet';
      if (b.classification & 0x40) return 'Spacecraft';
      if (b.classification & 0x80) return 'Reference point';
      return 'Unknown';
    }
    if (this.star) return 'Star';
    if (this.deepsky) return this.deepsky.type;
    if (this.location) return 'Surface feature';
    return '';
  }
}
