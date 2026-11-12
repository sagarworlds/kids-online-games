import test from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import { PADS, padsFor } from '../../src/games/simon-says/logic/pads.js';
import {
  PAD_SIZE, PAD_GAP, PAD_TRAVEL, gridOf, padLayout, boardWidth, shapeOutline, lighten, padPose, startView, viewLimits,
} from '../../src/games/simon-says/logic/look3d.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

test('four pads make a 2 by 2 board and six make 3 by 2; anything else is refused', () => {
  assert.deepEqual(gridOf(4), { cols: 2, rows: 2 });
  assert.deepEqual(gridOf(6), { cols: 3, rows: 2 });
  for (const bad of [0, 3, 5, 8, NaN]) throwsCode(() => gridOf(bad), 'BAD_PAD_COUNT');
  throwsCode(() => padLayout(5), 'BAD_PAD_COUNT');
});

test('the pads stand in reading order (pad 0 at the back left), centred, evenly spaced, none touching', () => {
  for (const count of [4, 6]) {
    const spots = padLayout(count);
    assert.equal(spots.length, count);
    near(spots.reduce((s, p) => s + p.x, 0), 0);
    near(spots.reduce((s, p) => s + p.z, 0), 0);
    assert.ok(spots[0].x < 0 && spots[0].z < 0, 'back left');
    assert.ok(spots[1].x > spots[0].x && near(spots[1].z, spots[0].z) === undefined, 'the next one is to its right');
    const { cols } = gridOf(count);
    assert.ok(spots[cols].z > spots[0].z && near(spots[cols].x, spots[0].x) === undefined, 'the next row is in front');
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) >= PAD_SIZE + PAD_GAP - 1e-9, 'a gap between pads');
    }
  }
  near(boardWidth(4), 2 * PAD_SIZE + PAD_GAP);
  assert.ok(boardWidth(6) > boardWidth(4));
});

test('every pad has an outline in its own shape, centred and the right size, and the circle is round (no corners)', () => {
  for (const pad of padsFor(6)) {
    const outline = shapeOutline(pad.shape, 1.2);
    if (pad.shape === 'circle') { assert.equal(outline, null); continue; }
    assert.ok(outline.length >= 3, pad.shape);
    const xs = outline.map(([x]) => x);
    const ys = outline.map(([, y]) => y);
    near((Math.min(...xs) + Math.max(...xs)) / 2, 0);
    near((Math.min(...ys) + Math.max(...ys)) / 2, 0);
    near(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), 1.2);
  }
  assert.equal(new Set(PADS.map((p) => p.shape)).size, PADS.length, 'no two pads share a shape');
  throwsCode(() => shapeOutline('blob'), 'UNKNOWN_SHAPE');
});

test('the triangle points up and the star has a point at the top, as on the flat pads (the picture is turned the right way up)', () => {
  const triangle = shapeOutline('triangle');
  const top = triangle.reduce((a, b) => (b[1] > a[1] ? b : a));
  near(top[0], 0, 1e-9);
  const star = shapeOutline('star');
  assert.ok(star.reduce((a, b) => (b[1] > a[1] ? b : a))[0] === star[0][0], 'the highest corner is the first one, at the top');
});

test('lightening blends towards white: none leaves the colour, all is white, half is half way', () => {
  assert.equal(lighten('#ff6b6b', 0), '#ff6b6b');
  assert.equal(lighten('#5aa9ff', 1), '#ffffff');
  assert.equal(lighten('#000000', 0.5), '#808080');
  // The same blend the flat pads use for their resting look: 0.55 of the way to white.
  assert.equal(lighten('#ff0000', 0.55), '#ff8c8c');
  throwsCode(() => lighten('red', 0.5), 'BAD_COLOR');
  throwsCode(() => lighten('#fff', 0.5), 'BAD_COLOR');
});

test('a pad goes down and glows as it lights, from resting to fully pressed, and never outside that', () => {
  assert.deepEqual(padPose(0), { drop: 0, glow: 0 });
  assert.deepEqual(padPose(1), { drop: PAD_TRAVEL, glow: 1 });
  assert.deepEqual(padPose(-3), padPose(0));
  assert.deepEqual(padPose(9), padPose(1));
  const half = padPose(0.5);
  near(half.drop, PAD_TRAVEL / 2);
  near(half.glow, 0.5);
});

test('a bigger board, or a narrower picture, is seen from further back; the limits allow the starting view and keep the camera above the console', () => {
  assert.ok(startView(6, 1.2).distance >= startView(4, 1.2).distance);
  assert.ok(startView(6, 0.9).distance > startView(6, 1.8).distance);
  for (const [count, aspect] of [[4, 1.2], [6, 1.2], [6, 1.7], [4, 0.9]]) {
    const { polar, distance } = startView(count, aspect);
    const limits = viewLimits(count, aspect);
    assert.ok(polar >= limits.minPolar && polar <= limits.maxPolar);
    assert.ok(distance >= limits.minDistance && distance <= limits.maxDistance);
    assert.ok(limits.maxPolar < Math.PI / 2);
  }
});
