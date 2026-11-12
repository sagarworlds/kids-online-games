import test from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import { SHAPES } from '../../src/games/pattern-detective/logic/generators/helpers.js';
import {
  SOLID_NAMES, solidName, describeSolid, SPACING, PEDESTAL_HALF, itemPosition, groupLayout, arrowYaw, spinAngle, SPIN_SECONDS, kickAngle,
  DROP_SECONDS, dropHeight, startView, viewLimits,
} from '../../src/games/pattern-detective/logic/look3d.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

test('every shape a case can use has a solid, and the solids have the names a child learns', () => {
  for (const shape of [...SHAPES, 'arrow']) assert.ok(solidName(shape), shape);
  assert.equal(solidName('circle'), 'sphere');
  assert.equal(solidName('square'), 'cube');
  assert.equal(solidName('triangle'), 'cone');
  assert.equal(new Set(Object.values(SOLID_NAMES)).size, Object.keys(SOLID_NAMES).length, 'no two shapes share a solid');
  throwsCode(() => solidName('hexagon'), 'UNKNOWN_SHAPE');
});

test('a tapped solid is named by its colour and its solid, with a count for a group', () => {
  assert.equal(describeSolid({ shape: 'circle', color: 'orange' }), 'orange sphere');
  assert.equal(describeSolid({ shape: 'square', color: 'sky', count: 1 }), 'sky cube');
  assert.equal(describeSolid({ shape: 'triangle', color: 'red', count: 3 }), '3 red cones');
  assert.equal(describeSolid({ shape: 'arrow', color: 'green', rotation: 90 }), 'green arrow');
});

test('the pedestals stand in a row, centred, evenly spaced, in sequence order from left to right', () => {
  for (const total of [4, 5, 6]) {
    const xs = Array.from({ length: total }, (_, i) => itemPosition(i, total).x);
    near(xs.reduce((a, b) => a + b, 0), 0);
    for (let i = 1; i < total; i++) near(xs[i] - xs[i - 1], SPACING);
    assert.ok(xs[0] < 0 && xs.at(-1) > 0);
  }
  throwsCode(() => itemPosition(5, 5), 'OUT_OF_SEQUENCE');
  throwsCode(() => itemPosition(-1, 5), 'OUT_OF_SEQUENCE');
  throwsCode(() => itemPosition(0, 0), 'BAD_COUNT');
});

test('a group of solids fits on its pedestal, in one row up to four and two rows after, smaller the more there are', () => {
  for (let count = 1; count <= 8; count++) {
    const spots = groupLayout(count);
    assert.equal(spots.length, count);
    for (const { x, z, scale } of spots) {
      assert.ok(Math.abs(x) <= PEDESTAL_HALF && Math.abs(z) <= PEDESTAL_HALF);
      assert.ok(scale > 0 && scale <= 1);
    }
    const rows = new Set(spots.map((s) => s.z.toFixed(6))).size;
    assert.equal(rows, count <= 4 ? 1 : 2, `${count} solids`);
    assert.equal(new Set(spots.map((s) => `${s.x.toFixed(6)},${s.z.toFixed(6)}`)).size, count, 'no two on the same spot');
  }
  assert.equal(groupLayout(1)[0].scale, 1);
  assert.ok(groupLayout(4)[0].scale < groupLayout(2)[0].scale && groupLayout(2)[0].scale < groupLayout(1)[0].scale);
  throwsCode(() => groupLayout(0), 'BAD_COUNT');
});

test('an arrow turns clockwise as seen from above: a quarter turn points it to the right, a half turn towards the camera', () => {
  // Forward is -z (away from the camera); a turn about y by +angle takes (0, -1) to (-sin, -cos).
  const point = (degrees) => { const a = arrowYaw(degrees); return { x: -Math.sin(a), z: -Math.cos(a) }; };
  near(point(0).x, 0); near(point(0).z, -1);
  near(point(90).x, 1); near(point(90).z, 0, 1e-12);
  near(point(180).x, 0, 1e-12); near(point(180).z, 1);
  near(point(270).x, -1);
  near(arrowYaw(360), -Math.PI * 2);
});

test('idle solids turn slowly, each in its own way, and always forwards', () => {
  assert.equal(spinAngle(0, 0), 0);
  assert.ok(spinAngle(1, 0) < Math.PI * 2, 'slower than a turn a second');
  assert.ok(spinAngle(2, 3) > spinAngle(1, 3));
  assert.notEqual(spinAngle(1, 0), spinAngle(1, 1));
  assert.notEqual(spinAngle(0, 1), spinAngle(0, 2));
});

test('a tapped solid makes one whole turn, quick at first and slowing, and is back where it was at the end', () => {
  assert.equal(kickAngle(0), 0);
  assert.equal(kickAngle(-1), 0);
  assert.equal(kickAngle(SPIN_SECONDS), 0);
  assert.equal(kickAngle(9), 0);
  const angles = [0.1, 0.3, 0.5, 0.7, 0.85].map((f) => kickAngle(SPIN_SECONDS * f));
  for (let i = 1; i < angles.length; i++) assert.ok(angles[i] > angles[i - 1], 'always turning on');
  assert.ok(angles.at(-1) < Math.PI * 2);
  assert.ok(angles[0] > (Math.PI * 2) * 0.2, 'a fast start');
  assert.ok(angles[1] - angles[0] > angles[4] - angles[3], 'slowing down');
});

test('the answer drops from above, never goes under its pedestal, and ends exactly on it', () => {
  assert.ok(dropHeight(0) > 3);
  assert.equal(dropHeight(DROP_SECONDS), 0);
  assert.equal(dropHeight(9), 0);
  assert.ok(dropHeight(-1) > 3, 'before it starts it waits above');
  for (let age = 0; age < DROP_SECONDS; age += 0.02) assert.ok(dropHeight(age) >= 0);
  assert.ok(dropHeight(0.3) < dropHeight(0.1), 'it is falling');
});

test('a longer row, or a narrower picture, is seen from further back; the limits allow the starting view and keep the camera above the table', () => {
  assert.ok(startView(6, 1.2).distance >= startView(5, 1.2).distance);
  assert.ok(startView(6, 0.9).distance > startView(6, 1.8).distance, 'a wide picture is nearer than a narrow one');
  for (const [total, aspect] of [[5, 1.2], [6, 1.2], [6, 1.7], [5, 0.9]]) {
    const { polar, distance } = startView(total, aspect);
    const limits = viewLimits(total, aspect);
    assert.ok(polar >= limits.minPolar && polar <= limits.maxPolar);
    assert.ok(distance >= limits.minDistance && distance <= limits.maxDistance);
    assert.ok(limits.maxPolar < Math.PI / 2);
  }
  throwsCode(() => startView(0, 1), 'BAD_COUNT');
});
