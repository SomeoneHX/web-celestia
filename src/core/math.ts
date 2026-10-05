// Double precision 3D math, mirroring the subset of Celestia's own
// math::Vector3 / Matrix3 / Quaternion that the simulation and the observer
// camera rely on. Matrices are row major and rotations follow the same
// right-handed, column-vector convention as the original.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const neg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? vec3(0, 0, 0) : mul(a, 1 / l);
};

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/** Rotate `v` about `axis` by `angle` radians. */
export function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kkv = dot(k, v);
  return {
    x: v.x * c + kv.x * s + k.x * kkv * (1 - c),
    y: v.y * c + kv.y * s + k.y * kkv * (1 - c),
    z: v.z * c + kv.z * s + k.z * kkv * (1 - c),
  };
}

export const X_AXIS = vec3(1, 0, 0);
export const Y_AXIS = vec3(0, 1, 0);
export const Z_AXIS = vec3(0, 0, 1);

// ------------------------------------------------------------------ matrices

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const mat3Identity = (): Mat3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const mat3FromRows = (a: Vec3, b: Vec3, c: Vec3): Mat3 => [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z];

export const mat3Transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return out as Mat3;
}

export const mat3Transform = (m: Mat3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});

export function mat3XRotation(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function mat3YRotation(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function mat3ZRotation(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** Rotation from unit axis and angle, equivalent to Eigen's AngleAxis. */
export function mat3AxisAngle(axis: Vec3, angle: number): Mat3 {
  const { x, y, z } = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

/** Build a matrix whose *columns* are the given basis vectors. */
export const mat3FromColumns = (a: Vec3, b: Vec3, c: Vec3): Mat3 => [a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z];

// --------------------------------------------------------------- quaternions

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export const quatIdentity = (): Quat => ({ w: 1, x: 0, y: 0, z: 0 });

export const quatMul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

export const quatConjugate = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const { x, y, z } = normalize(axis);
  const h = angle / 2;
  const s = Math.sin(h);
  return { w: Math.cos(h), x: x * s, y: y * s, z: z * s };
}

export function quatFromMatrix(m: Mat3): Quat {
  const trace = m[0] + m[4] + m[8];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return {
      w: 0.25 / s,
      x: (m[7] - m[5]) * s,
      y: (m[2] - m[6]) * s,
      z: (m[3] - m[1]) * s,
    };
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

export function quatToMatrix(q: Quat): Mat3 {
  const { w, x, y, z } = quatNormalize(q);
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

export const quatRotate = (q: Quat, v: Vec3): Vec3 => mat3Transform(quatToMatrix(q), v);

/** Shortest arc rotation taking `from` to `to`. */
export function quatFromTo(from: Vec3, to: Vec3): Quat {
  const a = normalize(from);
  const b = normalize(to);
  const d = dot(a, b);
  if (d > 0.999999) return quatIdentity();
  if (d < -0.999999) {
    let axis = cross(a, vec3(1, 0, 0));
    if (length(axis) < 1e-6) axis = cross(a, vec3(0, 1, 0));
    return quatFromAxisAngle(axis, Math.PI);
  }
  const c = cross(a, b);
  return quatNormalize({ w: 1 + d, x: c.x, y: c.y, z: c.z });
}

// ------------------------------------------------------------------ helpers

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;

export const KM_PER_AU = 149597870.7;
export const KM_PER_LY = 9460730472580.8;
/** Julian date of the J2000.0 epoch, 2000 January 1 12:00 TT. */
export const J2000 = 2451545.0;
export const AU_PER_LY = 63241.077084266280268653583182317313558;
export const SOLAR_RADIUS = 695700.0;
export const EARTH_RADIUS = 6378.1;
export const JUPITER_RADIUS = 71492.0;
export const SPEED_OF_LIGHT = 299792.458;

export default {
  vec3, add, sub, mul, neg, dot, cross, length, distance, normalize, lerp,
  rotateAround, mat3Identity, mat3Mul, mat3Transform, mat3XRotation,
  mat3YRotation, mat3ZRotation, mat3AxisAngle, mat3FromColumns, mat3FromRows,
  mat3Transpose, quatIdentity, quatMul, quatConjugate, quatNormalize,
  quatFromAxisAngle, quatFromMatrix, quatToMatrix, quatRotate, quatFromTo,
  clamp, degToRad, radToDeg,
};
