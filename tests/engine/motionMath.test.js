// The movement maths shared by every 3D version: easing, a camera that glides, turning the short way round and points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeInOut, approach, shortestTurn, distanceBetween, lerpPoint } from '../../src/engine/three/motionMath.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);

test('easeInOut starts and ends at rest, is symmetric, and holds its ends outside 0 to 1', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  near(easeInOut(0.5), 0.5);
  near(easeInOut(0.25) + easeInOut(0.75), 1);
  assert.equal(easeInOut(-3), 0);
  assert.equal(easeInOut(9), 1);
});

test('approach closes the same share of the gap in the same time on any frame rate, and really arrives', () => {
  const run = (frames, dt) => { let x = 0; for (let i = 0; i < frames; i++) x = approach(x, 10, dt); return x; };
  near(run(60, 1 / 60), run(30, 1 / 30), 1e-6);
  near(run(10, 0.1), run(1, 1), 1e-6);
  assert.equal(run(600, 1 / 60), 10, 'it lands exactly on the goal instead of creeping for ever');
  assert.equal(approach(3, 10, 0), 3);
  assert.equal(approach(3, 10, -1), 3);
  assert.equal(approach(3, 10, NaN), 3);
});

test('the camera swings the short way round, whatever size the two angles are', () => {
  near(shortestTurn(0, 1), 1);
  near(shortestTurn(0, -1), -1);
  near(shortestTurn(0.1, 2 * Math.PI - 0.1), -0.2, 1e-9);
  near(shortestTurn(6.2, 0.1), 0.1 + 2 * Math.PI - 6.2, 1e-9);
  near(shortestTurn(10, 10), 0);
  near(shortestTurn(-20, 40), shortestTurn(0, 60), 1e-9);
  assert.equal(shortestTurn(0, Math.PI), Math.PI, 'half a turn is the same either way; the answer is always the positive one');
  assert.equal(shortestTurn(Math.PI, 0), -Math.PI + 2 * Math.PI, 'and the same half turn from the other side');
  for (let a = -7; a < 7; a += 0.7) for (let b = -7; b < 7; b += 0.9) {
    const turn = shortestTurn(a, b);
    assert.ok(turn > -Math.PI - 1e-9 && turn <= Math.PI + 1e-9, `${a} to ${b} gave ${turn}`);
    near(Math.cos(a + turn), Math.cos(b), 1e-9); // it really does arrive at the same direction
  }
});


test('distance and interpolation between two points in space', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 3, y: 4, z: 12 };
  assert.equal(distanceBetween(a, b), 13);
  assert.equal(distanceBetween(b, a), 13);
  assert.equal(distanceBetween(a, a), 0);
  assert.deepEqual(lerpPoint(a, b, 0), a);
  assert.deepEqual(lerpPoint(a, b, 1), b);
  assert.deepEqual(lerpPoint(a, b, 0.5), { x: 1.5, y: 2, z: 6 });
});
