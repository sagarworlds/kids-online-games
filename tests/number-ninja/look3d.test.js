import test from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import {
  CAMERA_DISTANCE, FOV, STAR_RADIUS, skySize, starPosition, floorLevel, isUrgent, URGENT_FROM, starOutline, halfOf, polygonArea,
  SLICE_SECONDS, halfMotion, sparkMotion, TEXT_SECONDS, risingText, REVEAL_SECONDS, revealOpacity,
} from '../../src/games/number-ninja/logic/look3d.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

test('the sky the camera sees is as wide as the picture is wide, and its height is what the distance and the angle of view give', () => {
  const wide = skySize(2);
  near(wide.width, wide.height * 2);
  near(wide.height, 2 * CAMERA_DISTANCE * Math.tan((FOV * Math.PI) / 360));
  assert.ok(skySize(1.2).width < wide.width);
  throwsCode(() => skySize(0), 'BAD_ASPECT');
  throwsCode(() => skySize(NaN), 'BAD_ASPECT');
  throwsCode(() => skySize(-1), 'BAD_ASPECT');
});

test('a star falls straight down its lane, from near the top of the picture to near the floor, and the lanes keep their order from left to right', () => {
  for (const aspect of [1.1, 1.7]) {
    const { width, height } = skySize(aspect);
    const top = starPosition({ x: 0.5, y: 0 }, aspect);
    const landed = starPosition({ x: 0.5, y: 1 }, aspect);
    assert.ok(top.y < height / 2 && top.y > landed.y);
    assert.ok(landed.y > -height / 2 + STAR_RADIUS, 'a landed star is above the bottom edge');
    assert.ok(landed.y - STAR_RADIUS > floorLevel(aspect), 'and above the floor, with room under it for its plate');
    near(top.x, 0);
    const lanes = [0.1, 0.3, 0.5, 0.7, 0.9].map((x) => starPosition({ x, y: 0.4 }, aspect).x);
    for (let i = 1; i < lanes.length; i++) assert.ok(lanes[i] > lanes[i - 1]);
    assert.ok(lanes[0] > -width / 2 && lanes.at(-1) < width / 2, 'every lane is inside the picture');
    const mid = [0, 0.25, 0.5, 0.75, 1].map((y) => starPosition({ x: 0.5, y }, aspect).y);
    for (let i = 1; i < mid.length; i++) assert.ok(mid[i] < mid[i - 1], 'always falling');
  }
  // Outside the round's own range it holds at the ends rather than leaving the picture.
  assert.equal(starPosition({ x: 0.5, y: 3 }, 1.5).y, starPosition({ x: 0.5, y: 1 }, 1.5).y);
  assert.equal(starPosition({ x: 0.5, y: -2 }, 1.5).y, starPosition({ x: 0.5, y: 0 }, 1.5).y);
});

test('a star is urgent in the last quarter of its fall, as on the flat screen', () => {
  assert.equal(URGENT_FROM, 0.75);
  assert.equal(isUrgent(0.74), false);
  assert.equal(isUrgent(0.75), true);
  assert.equal(isUrgent(1), true);
});

test('a star outline has ten corners, a point straight up, the other points evenly round, and the right size', () => {
  const outline = starOutline(1, 0.5);
  assert.equal(outline.length, 10);
  near(outline[0][0], 0); near(outline[0][1], 1);
  for (let i = 0; i < 10; i += 2) near(Math.hypot(...outline[i]), 1);
  for (let i = 1; i < 10; i += 2) near(Math.hypot(...outline[i]), 0.5);
  // Clockwise from the top: the next corner is on the right.
  assert.ok(outline[1][0] > 0 && outline[9][0] < 0);
});

test('cutting a star down the middle gives a left half and a right half that fit back together, each on its own side of the cut', () => {
  const star = starOutline(1, 0.45);
  const left = halfOf(star, -1);
  const right = halfOf(star, 1);
  assert.ok(left.length >= 3 && right.length >= 3);
  for (const [x] of left) assert.ok(x <= 1e-12);
  for (const [x] of right) assert.ok(x >= -1e-12);
  near(polygonArea(left) + polygonArea(right), polygonArea(star), 1e-9);
  near(polygonArea(left), polygonArea(right), 1e-9);
  // The two corners where the cut crosses the outline are on the line x = 0, at the top point and the notch below.
  assert.equal(left.filter(([x]) => Math.abs(x) < 1e-12).length >= 2, true);
  assert.deepEqual(halfOf(star, -1).length, halfOf(star, 1).length);
});

test('a shape that is wholly on one side is kept whole on that side and gives nothing on the other', () => {
  const square = [[1, 0], [3, 0], [3, 2], [1, 2]];
  assert.equal(polygonArea(halfOf(square, 1)), 4);
  assert.equal(halfOf(square, -1).length, 0);
  throwsCode(() => halfOf(square, 0), 'BAD_SIDE');
});

test('the area of a polygon is the same whichever way round its corners go', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  assert.equal(polygonArea(square), 4);
  assert.equal(polygonArea([...square].reverse()), 4);
});

test('the two halves of a sliced star start together, drift apart in opposite ways, fall, turn opposite ways and fade away completely', () => {
  const start = [halfMotion(-1, 0), halfMotion(1, 0)];
  for (const m of start) { near(m.x, 0); near(m.y, 0); near(m.rotation, 0); near(m.opacity, 1); }
  const end = [halfMotion(-1, SLICE_SECONDS), halfMotion(1, SLICE_SECONDS)];
  assert.ok(end[0].x < 0 && end[1].x > 0);
  near(end[0].x, -end[1].x);
  near(end[0].rotation, -end[1].rotation);
  assert.ok(end[0].y < 0);
  near(end[0].opacity, 0);
  const mid = halfMotion(1, SLICE_SECONDS / 2);
  assert.ok(mid.opacity > 0 && mid.opacity < 1 && mid.x > 0 && mid.x < end[1].x);
  assert.deepEqual(halfMotion(1, 99), halfMotion(1, SLICE_SECONDS), 'it stops at the end');
});

test('a spark flies out the way it points and fades', () => {
  const up = sparkMotion(Math.PI / 2, 0.25);
  near(up.x, 0, 1e-9);
  assert.ok(up.y > 0 && up.opacity > 0 && up.opacity < 1 && up.scale < 1);
  const right = sparkMotion(0, 0.5);
  assert.ok(right.x > 2 && Math.abs(right.y) < 1e-9);
  near(right.opacity, 0);
  near(sparkMotion(1, 0).x, 0);
});

test('the score floats up and fades, or with less motion stays put and fades', () => {
  assert.deepEqual(risingText(0), { y: 0, opacity: 1 });
  const end = risingText(TEXT_SECONDS);
  assert.ok(end.y > 1 && end.opacity === 0);
  assert.equal(risingText(TEXT_SECONDS / 2, true).y, 0);
  assert.ok(risingText(TEXT_SECONDS / 2, true).opacity < 1);
});

test('the answer plate of a star that landed stays fully visible and then fades over its last fraction of a second', () => {
  assert.equal(revealOpacity(0), 1);
  assert.equal(revealOpacity(REVEAL_SECONDS - 0.3), 1);
  assert.ok(revealOpacity(REVEAL_SECONDS - 0.15) > 0 && revealOpacity(REVEAL_SECONDS - 0.15) < 1);
  assert.equal(revealOpacity(REVEAL_SECONDS), 0);
  assert.equal(revealOpacity(REVEAL_SECONDS + 1), 0);
});
