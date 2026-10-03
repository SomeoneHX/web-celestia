// Checks the drag-rotation binding against Celestia's own formula.
//
//   node native/check-rotation.mjs
//
// CelestiaCore::mouseMove turns a left drag with no reference object by
//
//   coarseness = radToDeg(observer.getFOV()) / 30
//   q = XRotation(dy / height * coarseness) * YRotation(dx / width * coarseness)
//   sim->rotate(q.conjugate())
//
// Observer::rotate applies q in the observer's own frame, so the rotation the
// observer ends up with has the angle of q. A drag covering the whole drawable
// height at a 45 degree field of view must therefore turn the camera by exactly
// 45 / 30 = 1.5 radians, whatever the drawable is measured in.
//
// No catalogue is loaded: a Simulation only needs a Universe.

import createCelestiaCore from '../src/wasm/celestia_core.js';

const module = await createCelestiaCore({
  print: (text) => console.log('[engine]', text),
  printErr: (text) => console.error('[engine]', text),
});

const engine = new module.CelestiaEngine();
engine.start();
if (!engine.hasSimulation()) throw new Error('no simulation');

const DEG = 180 / Math.PI;

/** The quaternion the observer is currently at, as [x, y, z, w]. */
function orientation() {
  const q = engine.observerOrientation();
  const value = [q.get(0), q.get(1), q.get(2), q.get(3)];
  q.delete();
  return value;
}

/** Angle in radians between two orientations. */
function angleBetween(a, b) {
  // Relative rotation is b * a^-1; for unit quaternions that is b * conjugate(a).
  const [bx, by, bz, bw] = b;
  const [ax, ay, az, aw] = [-a[0], -a[1], -a[2], a[3]];
  const w = bw * aw - bx * ax - by * ay - bz * az;
  const x = bw * ax + bx * aw + by * az - bz * ay;
  const y = bw * ay - bx * az + by * aw + bz * ax;
  const z = bw * az + bx * ay - by * ax + bz * aw;
  const vector = Math.hypot(x, y, z);
  return 2 * Math.atan2(vector, Math.abs(w));
}

let failures = 0;

function check(label, fov, dx, dy, width, height, expected) {
  // The bindings expose Celestia's native radians, not degrees.
  engine.setObserverFov(fov / DEG);
  const before = orientation();
  engine.rotateObserverByDrag(dx, dy, width, height);
  const measured = angleBetween(before, orientation());
  const ok = Math.abs(measured - expected) < 1e-4;
  if (!ok) failures++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(46)} ` +
    `measured=${measured.toFixed(6)} rad (${(measured * DEG).toFixed(4)} deg)  ` +
    `expected=${expected.toFixed(6)} rad`,
  );
}

// A full-height drag at 45 degrees turns by 45 / 30 = 1.5 rad.
check('fov 45, full height drag', 45, 0, 800, 1200, 800, 1.5);
check('fov 45, half height drag', 45, 0, 400, 1200, 800, 0.75);
check('fov 45, full width drag', 45, 1200, 0, 1200, 800, 1.5);
check('fov 90, full height drag', 90, 0, 800, 1200, 800, 3.0);
check('fov 22.5, full height drag', 22.5, 0, 800, 1200, 800, 0.75);

// Only the ratio of drag to drawable size matters, so the same gesture on a
// 2x drawable has to turn the camera by the same angle. This is what lets the
// frontend hand over device pixels, as Celestia's Qt widget does.
check('fov 45, 2x drawable, 2x drag', 45, 0, 1600, 2400, 1600, 1.5);

console.log(failures === 0 ? '\nall rotation checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
