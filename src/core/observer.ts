// The observer camera, mirroring engine::Observer.
//
// The camera is a position plus an orientation frame in the scene's inertial
// frame. Forward is -Z of the frame, matching the OpenGL convention Celestia
// uses, so the view matrix is the inverse of the frame translation and the
// basis vectors taken as columns.

import {
  type Vec3, vec3, add, sub, mul, neg, normalize, cross, dot, length,
  type Quat, quatIdentity, quatMul, quatFromAxisAngle, quatToMatrix, quatRotate,
  quatNormalize, quatConjugate, quatFromTo, mat3Transform, clamp, degToRad, radToDeg,
  KM_PER_AU,
} from './math';
import { Selection } from './selection';
import type { Simulation } from './simulation';

export type TravelMode = 'none' | 'goto' | 'follow' | 'syncOrbit' | 'lock' | 'chase';

export type CoordinateSystem =
  | 'universal'
  | 'ecliptic'
  | 'equatorial'
  | 'galactic'
  | 'observerLocal'
  | 'planetographic';

export interface ObserverOptions {
  fov?: number;
  nearPlane?: number;
  farPlane?: number;
}

/** Smooth travel state between two camera poses. */
interface TravelState {
  startPosition: Vec3;
  startOrientation: Quat;
  endPosition: Vec3;
  endOrientation: Quat;
  duration: number;
  elapsed: number;
}

const FORWARD = vec3(0, 0, -1);
const UP = vec3(0, 1, 0);
const RIGHT = vec3(1, 0, 0);

export class Observer {
  private simulation: Simulation;

  /** Camera position in the scene frame, kilometres. */
  position: Vec3 = vec3(0, 0, 0);
  /** Camera frame in the scene frame. Forward is -Z. */
  orientation: Quat = quatIdentity();

  /** Vertical field of view, radians. */
  fov = degToRad(45);
  nearPlane = 0.5;
  farPlane = 1e12;
  fovWidescreen = degToRad(45);

  /** The object the camera is currently anchored to. */
  target: Selection = new Selection();
  frameCenter: Selection = new Selection();

  travelMode: TravelMode = 'none';
  coordinateSystem: CoordinateSystem = 'universal';
  reverseFlag = false;

  /** Distance to keep from the target while travelling, kilometres. */
  distanceToTarget = 0;
  /** Angular size of the selection, recorded when the target changes. */
  angularSize = 0;

  /** Offset applied when following a body, in the body's frame. */
  followOffset = vec3(0, 0, 0);

  private travel: TravelState | null = null;
  private lastFrameTime = 0;

  /** Dirty flag consumed by the renderer to rebuild its view matrix. */
  viewDirty = true;

  constructor(simulation: Simulation, options: ObserverOptions = {}) {
    this.simulation = simulation;
    if (options.fov !== undefined) this.fov = options.fov;
    if (options.nearPlane !== undefined) this.nearPlane = options.nearPlane;
    if (options.farPlane !== undefined) this.farPlane = options.farPlane;
  }

  // ------------------------------------------------------------------ basis

  getDirection(): Vec3 {
    return normalize(quatRotate(this.orientation, FORWARD));
  }

  getUp(): Vec3 {
    return normalize(quatRotate(this.orientation, UP));
  }

  getRight(): Vec3 {
    return normalize(quatRotate(this.orientation, RIGHT));
  }

  getOrientation(): Quat {
    return this.orientation;
  }

  setOrientation(q: Quat): void {
    this.orientation = quatNormalize(q);
    this.viewDirty = true;
  }

  setPosition(p: Vec3): void {
    this.position = p;
    this.viewDirty = true;
  }

  getFov(): number {
    return this.fov;
  }

  setFov(fov: number): void {
    this.fov = clamp(fov, degToRad(0.001), degToRad(160));
    this.viewDirty = true;
  }

  // -------------------------------------------------------------- rotations

  /** Rotates the camera in place about an axis in the camera frame. */
  rotate(angle: number, worldAxis?: Vec3): void {
    const axis = worldAxis ?? this.getUp();
    const q = quatFromAxisAngle(normalize(axis), angle);
    this.orientation = quatNormalize(quatMul(q, this.orientation));
    this.viewDirty = true;
  }

  /** Rotates the camera in place about the camera's local axes. */
  rotateLocal(angleX: number, angleY: number, angleZ: number): void {
    const q = quatMul(
      quatMul(quatFromAxisAngle(this.getUp(), angleX), quatFromAxisAngle(this.getRight(), angleY)),
      quatFromAxisAngle(this.getDirection(), angleZ),
    );
    this.orientation = quatNormalize(quatMul(q, this.orientation));
    this.viewDirty = true;
  }

  /** Orbits the camera around the reference centre. */
  orbit(angleX: number, angleY: number, angleZ = 0): void {
    const center = this.getFrameCenterPosition();
    const offset = sub(this.position, center);
    if (length(offset) < 1e-9) {
      this.rotateLocal(angleX, angleY, angleZ);
      return;
    }

    const right = this.getRight();
    const up = this.getUp();
    const forward = this.getDirection();

    let rotated = rotateAroundAxis(offset, up, -angleX);
    rotated = rotateAroundAxis(rotated, right, -angleY);
    if (angleZ !== 0) rotated = rotateAroundAxis(rotated, forward, angleZ);

    this.position = add(center, rotated);

    // Keep the same point in view by rotating the orientation by the same amount.
    const q = quatMul(
      quatMul(quatFromAxisAngle(up, -angleX), quatFromAxisAngle(right, -angleY)),
      quatFromAxisAngle(forward, angleZ),
    );
    this.orientation = quatNormalize(quatMul(q, this.orientation));
    this.viewDirty = true;
  }

  /** Orbits about the body's pole, used by the right-drag control. */
  orbitAboutBody(angleX: number, angleY: number): void {
    this.orbit(angleX, angleY);
  }

  /** Moves closer to or further from the centre by `delta` kilometres. */
  changeOrbitDistance(delta: number): void {
    const center = this.getFrameCenterPosition();
    const offset = sub(this.position, center);
    const distance = length(offset);
    if (distance < 1e-9) return;
    const newDistance = Math.max(distance + delta, 1e-3);
    this.position = add(center, mul(offset, newDistance / distance));
    this.distanceToTarget = newDistance;
    this.viewDirty = true;
  }

  /** Scales the orbit distance, which is what the mouse wheel does. */
  scaleOrbitDistance(factor: number): void {
    const center = this.getFrameCenterPosition();
    const offset = sub(this.position, center);
    const distance = length(offset);
    if (distance < 1e-9) return;
    const newDistance = clamp(distance * factor, 1e-3, 1e14);
    this.position = add(center, mul(offset, newDistance / distance));
    this.distanceToTarget = newDistance;
    this.viewDirty = true;
  }

  // ---------------------------------------------------------------- framing

  /** Position of the reference centre in the scene frame, kilometres. */
  getFrameCenterPosition(): Vec3 {
    const sel = this.frameCenter.isEmpty ? this.simulation.getSelection() : this.frameCenter;
    return this.selectionPosition(sel);
  }

  /** Scene position of a selection, kilometres from the solar system origin. */
  selectionPosition(sel: Selection): Vec3 {
    const tdb = this.simulation.getTime();
    const universe = this.simulation.universe;
    if (sel.body) return universe.getBodyScenePosition(sel.body, tdb);
    if (sel.star) return universe.starCatalog.getPosition(sel.star);
    if (sel.deepsky) return mul(sel.deepsky.position, 1e9);
    if (sel.location) return universe.getLocationScenePosition(sel.location, tdb);
    return vec3(0, 0, 0);
  }

  /** Distance from the camera to the current selection, kilometres. */
  getDistanceToSelection(): number {
    const sel = this.simulation.getSelection();
    if (sel.isEmpty) return 0;
    return length(sub(this.position, this.selectionPosition(sel)));
  }

  /** Angular size in radians of the selection as seen from the camera. */
  getSelectionAngularSize(): number {
    const sel = this.simulation.getSelection();
    if (sel.isEmpty || sel.radius <= 0) return 0;
    const distance = Math.max(this.getDistanceToSelection() - sel.radius, 1e-6);
    return 2 * Math.asin(clamp(sel.radius / (distance + sel.radius), 0, 1));
  }

  /** Points the camera at the selection without moving. */
  centerSelection(): void {
    const sel = this.simulation.getSelection();
    if (sel.isEmpty) return;
    const target = this.selectionPosition(sel);
    const direction = normalize(sub(target, this.position));
    if (length(direction) < 1e-9) return;
    this.setOrientation(quatFromTo(FORWARD, direction));
  }

  /** Places the camera at a given distance from the selection, looking at it. */
  gotoSelection(distance: number, up: Vec3 = UP, transitionTime = 0): void {
    const sel = this.simulation.getSelection();
    if (sel.isEmpty) return;
    const target = this.selectionPosition(sel);
    const direction = normalize(sub(this.position, target));
    const safeDirection = length(direction) < 1e-9 ? vec3(0, 0, 1) : direction;
    const destination = add(target, mul(safeDirection, Math.max(distance, sel.radius * 1.01)));

    // Orientation: look from the destination towards the target.
    const look = normalize(sub(target, destination));
    let finalUp = normalize(up);
    if (Math.abs(dot(look, finalUp)) > 0.999) finalUp = vec3(0, 0, 1);
    const finalOrientation = lookAtOrientation(look, finalUp);

    this.beginTravel(destination, finalOrientation, transitionTime);
    this.distanceToTarget = distance;
  }

  /** Travels to a point at a given distance, azimuth and elevation. */
  gotoSelectionLongLat(distance: number, longitude: number, latitude: number, up: Vec3 = UP, transitionTime = 0): void {
    const sel = this.simulation.getSelection();
    if (sel.isEmpty) return;
    const target = this.selectionPosition(sel);

    // Build the offset in the body's local horizontal frame.
    const northEastUp = bodyLocalAxes(sel, this.simulation.getTime(), this.simulation.universe);
    const cosLat = Math.cos(latitude);
    const offsetDirection = normalize(
      add(
        add(mul(northEastUp.north, cosLat * Math.cos(longitude)), mul(northEastUp.east, cosLat * Math.sin(longitude))),
        mul(northEastUp.up, Math.sin(latitude)),
      ),
    );

    const destination = add(target, mul(offsetDirection, distance));
    const look = normalize(sub(target, destination));
    let finalUp = normalize(northEastUp.up);
    if (Math.abs(dot(look, finalUp)) > 0.999) finalUp = up;
    this.beginTravel(destination, lookAtOrientation(look, finalUp), transitionTime);
    this.distanceToTarget = distance;
  }

  private beginTravel(destination: Vec3, finalOrientation: Quat, duration: number): void {
    if (duration <= 0) {
      this.position = destination;
      this.orientation = finalOrientation;
      this.travel = null;
      this.viewDirty = true;
      return;
    }
    this.travel = {
      startPosition: this.position,
      startOrientation: this.orientation,
      endPosition: destination,
      endOrientation: finalOrientation,
      duration,
      elapsed: 0,
    };
    this.travelMode = 'goto';
    this.lastFrameTime = 0;
  }

  // ------------------------------------------------------------ travel modes

  /** Latches onto the selection and keeps the current offset. */
  setTarget(sel: Selection, mode: TravelMode): void {
    this.target = sel.clone();
    this.frameCenter = sel.clone();
    this.travelMode = mode;
    if (mode === 'follow' || mode === 'syncOrbit' || mode === 'lock' || mode === 'chase') {
      this.followOffset = sub(this.position, this.selectionPosition(sel));
    }
    this.viewDirty = true;
  }

  follow(): void {
    this.setTarget(this.simulation.getSelection(), 'follow');
  }

  syncOrbit(): void {
    this.setTarget(this.simulation.getSelection(), 'syncOrbit');
  }

  lock(): void {
    this.setTarget(this.simulation.getSelection(), 'lock');
  }

  chase(): void {
    this.setTarget(this.simulation.getSelection(), 'chase');
  }

  cancelMotion(): void {
    this.travel = null;
    this.travelMode = 'none';
    this.target = new Selection();
    this.frameCenter = new Selection();
  }

  // ----------------------------------------------------------------- update

  /** Advances the camera. `dt` is elapsed real time in seconds. */
  update(dt: number, realTime: number): void {
    if (this.travel) {
      this.travel.elapsed += dt;
      const t = clamp(this.travel.elapsed / Math.max(this.travel.duration, 1e-6), 0, 1);
      // Smoothstep, which is what Celestia's goto transition uses.
      const s = t * t * (3 - 2 * t);
      this.position = lerpVec(this.travel.startPosition, this.travel.endPosition, s);
      this.orientation = quatNormalize(slerp(this.travel.startOrientation, this.travel.endOrientation, s));
      this.viewDirty = true;
      if (t >= 1) {
        this.travel = null;
        if (this.travelMode === 'goto') this.travelMode = 'none';
      }
      return;
    }

    if (this.travelMode === 'none' || this.target.isEmpty) return;

    const sel = this.target;
    const targetPosition = this.selectionPosition(sel);

    if (this.travelMode === 'follow') {
      const desired = add(targetPosition, this.followOffset);
      this.position = desired;
      this.viewDirty = true;
      // Keep the offset up to date so the framing does not drift.
      this.followOffset = sub(this.position, targetPosition);
      return;
    }

    if (this.travelMode === 'syncOrbit' || this.travelMode === 'lock') {
      if (sel.body) {
        const orientation = sel.body.getOrientationQuaternion(this.simulation.getTime());
        const localOffset = quatRotate(quatConjugate(orientation), this.followOffset);
        this.position = add(targetPosition, quatRotate(orientation, localOffset));
        if (this.travelMode === 'syncOrbit') {
          this.orientation = quatMul(orientation, this.orientation);
        }
        this.viewDirty = true;
      }
      return;
    }

    if (this.travelMode === 'chase') {
      const direction = normalize(sub(this.position, targetPosition));
      const forward = normalize(quatRotate(this.orientation, FORWARD));
      // Move along the direction of view, keeping the distance to the target.
      const distance = length(sub(this.position, targetPosition)) + 0;
      this.position = add(this.position, mul(forward, distance * 0.05 * dt));
      void direction;
      this.viewDirty = true;
    }
  }

  // ------------------------------------------------------------- projections

  /** Column major view matrix for WebGL, in kilometres. */
  getViewMatrix(): Float32Array {
    const right = this.getRight();
    const up = this.getUp();
    const back = neg(this.getDirection());

    const m = new Float32Array(16);
    m[0] = right.x;
    m[1] = up.x;
    m[2] = back.x;
    m[3] = 0;
    m[4] = right.y;
    m[5] = up.y;
    m[6] = back.y;
    m[7] = 0;
    m[8] = right.z;
    m[9] = up.z;
    m[10] = back.z;
    m[11] = 0;
    m[12] = -dot(right, this.position);
    m[13] = -dot(up, this.position);
    m[14] = -dot(back, this.position);
    m[15] = 1;
    return m;
  }

  /** Column major perspective projection matrix for WebGL. */
  getProjectionMatrix(aspect: number): Float32Array {
    const f = 1 / Math.tan(this.fov / 2);
    const near = this.nearPlane;
    const far = this.farPlane;
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }

  /** Screen space size in pixels of an object of the given radius. */
  pixelSizeOf(radiusKm: number, distanceKm: number, viewportHeight: number): number {
    if (distanceKm <= 0) return viewportHeight;
    const angular = 2 * Math.atan(radiusKm / Math.max(distanceKm, 1e-6));
    return (angular / this.fov) * viewportHeight;
  }

  getFovDegrees(): number {
    return radToDeg(this.fov);
  }

  setFovDegrees(deg: number): void {
    this.setFov(degToRad(deg));
  }
}

// ------------------------------------------------------------------ helpers

function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kk = dot(k, v);
  return vec3(
    v.x * c + kv.x * s + k.x * kk * (1 - c),
    v.y * c + kv.y * s + k.y * kk * (1 - c),
    v.z * c + kv.z * s + k.z * kk * (1 - c),
  );
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

/** Spherical interpolation, falling back to a linear blend for near-parallel input. */
function slerp(a: Quat, b: Quat, t: number): Quat {
  let cosom = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (1 - cosom < 1e-6) {
    return quatNormalize({ w: a.w + (bw - a.w) * t, x: a.x + (bx - a.x) * t, y: a.y + (by - a.y) * t, z: a.z + (bz - a.z) * t });
  }
  const omega = Math.acos(cosom);
  const sinom = Math.sin(omega);
  const scale0 = Math.sin((1 - t) * omega) / sinom;
  const scale1 = Math.sin(t * omega) / sinom;
  return quatNormalize({
    w: a.w * scale0 + bw * scale1,
    x: a.x * scale0 + bx * scale1,
    y: a.y * scale0 + by * scale1,
    z: a.z * scale0 + bz * scale1,
  });
}

/** Orientation whose -Z looks along `direction` and whose +Y follows `up`. */
export function lookAtOrientation(direction: Vec3, up: Vec3): Quat {
  const back = neg(normalize(direction));
  let right = cross(normalize(up), back);
  if (length(right) < 1e-9) right = vec3(1, 0, 0);
  right = normalize(right);
  const realUp = cross(back, right);
  const m: [number, number, number, number, number, number, number, number, number] = [
    right.x, realUp.x, back.x,
    right.y, realUp.y, back.y,
    right.z, realUp.z, back.z,
  ];
  return quatFromMatrixTransposed(m);
}

function quatFromMatrixTransposed(m: [number, number, number, number, number, number, number, number, number]): Quat {
  const trace = m[0] + m[4] + m[8];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { w: 0.25 / s, x: (m[7] - m[5]) * s, y: (m[2] - m[6]) * s, z: (m[3] - m[1]) * s };
  }
  if (m[0] > m[4] && m[0] > m[8]) {
    const s = 2 * Math.sqrt(1 + m[0] - m[4] - m[8]);
    return { w: (m[7] - m[5]) / s, x: 0.25 * s, y: (m[1] + m[3]) / s, z: (m[2] + m[6]) / s };
  }
  if (m[4] > m[8]) {
    const s = 2 * Math.sqrt(1 + m[4] - m[0] - m[8]);
    return { w: (m[2] - m[6]) / s, x: (m[1] + m[3]) / s, y: 0.25 * s, z: (m[5] + m[7]) / s };
  }
  const s = 2 * Math.sqrt(1 + m[8] - m[0] - m[4]);
  return { w: (m[3] - m[1]) / s, x: (m[2] + m[6]) / s, y: (m[5] + m[7]) / s, z: 0.25 * s };
}

/** Local north, east and up axes of a body at the given time, in the scene frame. */
function bodyLocalAxes(
  sel: Selection,
  tdb: number,
  universe: { getBodyScenePosition: (b: NonNullable<Selection['body']>, t: number) => Vec3 },
): { north: Vec3; east: Vec3; up: Vec3 } {
  if (!sel.body) return { north: vec3(0, 1, 0), east: vec3(1, 0, 0), up: vec3(0, 0, 1) };
  const body = sel.body;
  const orientation = body.getOrientation(tdb);
  const position = universe.getBodyScenePosition(body, tdb);
  const up = normalize(position);
  const pole = vec3(orientation[2], orientation[5], orientation[8]);
  const east = cross(pole, up);
  const north = cross(up, east);
  return { north: normalize(north), east: normalize(east), up };
}

export { KM_PER_AU, mat3Transform, quatToMatrix, radToDeg };
