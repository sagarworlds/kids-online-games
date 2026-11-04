import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameError } from '../../src/engine/utils/errors.js';
import { SPACING, dist, line, poly, arc, join, pathLength, resample, shift, bounds, pointAlong, toSvgPath } from '../../src/games/trace-trail/logic/shapes.js';
import {
  StrokeTracker, GlyphTracer, strokeScore, demoTimeline, demoState, START_FACTOR, MISTAKE_PENALTY, MAX_MISTAKE_PENALTY,
} from '../../src/games/trace-trail/logic/trace.js';

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GameError, `expected a GameError but got ${error}`);
    return error.code;
  }
  return null;
}
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const near = (p, q, eps = 1e-6) => close(p[0], q[0], eps) && close(p[1], q[1], eps);

// ---- drawing tools ----------------------------------------------------------------------------

test('line and poly give the points as written', () => {
  assert.deepEqual(line(0, 0, 30, 40), [[0, 0], [30, 40]]);
  assert.deepEqual(poly([0, 0], [10, 0], [10, 10]), [[0, 0], [10, 0], [10, 10]]);
  assert.equal(pathLength(line(0, 0, 30, 40)), 50);
});

test('arc: angles go clockwise on the screen, from 0 at the right', () => {
  const quarter = arc(50, 50, 20, 20, 0, 90);
  assert.ok(near(quarter[0], [70, 50]) && near(quarter.at(-1), [50, 70]), 'right to bottom');
  const up = arc(50, 50, 20, 20, 270, 360);
  assert.ok(near(up[0], [50, 30]) && near(up.at(-1), [70, 50]), 'top to right');
  const back = arc(50, 50, 20, 20, 90, 0);
  assert.ok(near(back[0], [50, 70]) && near(back.at(-1), [70, 50]), 'a smaller end angle goes anticlockwise');
  const ellipse = arc(0, 0, 40, 10, 0, 180);
  assert.ok(near(ellipse[0], [40, 0]) && near(ellipse.at(-1), [-40, 0]));
  assert.ok(ellipse.every(([, y]) => y >= -1e-9), 'the lower half');
  const full = arc(0, 0, 20, 20, 0, 360);
  assert.ok(Math.abs(pathLength(full) - 2 * Math.PI * 20) < 1, 'a full circle has the right length');
  assert.ok(arc(0, 0, 20, 20, 0, 90).length >= 5, 'enough points to look round');
});

test('join: pieces run on from each other and a repeated joint is dropped', () => {
  const path = join(line(0, 0, 10, 0), line(10, 0, 10, 10), arc(10, 20, 10, 10, 270, 360));
  assert.deepEqual(path.slice(0, 3), [[0, 0], [10, 0], [10, 10]]);
  assert.equal(path.filter((p) => near(p, [10, 0])).length, 1);
  assert.deepEqual(join(), []);
});

test('resample: points are evenly spaced, the ends are kept, and the length is kept', () => {
  const rough = poly([0, 0], [100, 0], [100, 40]);
  const path = resample(rough);
  assert.deepEqual(path[0], [0, 0]);
  assert.deepEqual(path.at(-1), [100, 40]);
  for (let i = 1; i < path.length - 1; i++) assert.ok(close(dist(path[i - 1], path[i]), SPACING, 1e-6) || dist(path[i - 1], path[i]) < SPACING, `gap ${i}`);
  assert.ok(dist(path.at(-2), path.at(-1)) <= SPACING + 1e-6);
  assert.ok(Math.abs(pathLength(path) - 140) < 1, 'the corner is rounded off very little');
  assert.ok(path.some((p) => close(p[0], 100, 3) && p[1] < 8), 'the corner is still in the path');
  assert.equal(codeOf(() => resample([[0, 0]])), 'BAD_PATH');
  assert.equal(codeOf(() => resample([[0, 0], [0, 0]])), 'BAD_PATH');
  assert.equal(codeOf(() => resample([[0, 0], [1, 0]])), 'BAD_PATH', 'shorter than one gap');
  assert.deepEqual(resample(line(0, 0, SPACING, 0)).at(-1), [SPACING, 0]);
});

test('pointAlong, shift, bounds and toSvgPath', () => {
  const path = poly([0, 0], [10, 0], [10, 10]);
  assert.deepEqual(pointAlong(path, 0), [0, 0]);
  assert.deepEqual(pointAlong(path, 5), [5, 0]);
  assert.deepEqual(pointAlong(path, 15), [10, 5]);
  assert.deepEqual(pointAlong(path, 999), [10, 10], 'past the end is the end');
  assert.deepEqual(pointAlong(path, -4), [0, 0]);
  assert.deepEqual(shift(path, 5, -2), [[5, -2], [15, -2], [15, 8]]);
  assert.deepEqual(bounds([path, [[-3, 20]]]), { x0: -3, y0: 0, x1: 10, y1: 20 });
  assert.equal(toSvgPath(path), 'M0.0 0.0 L10.0 0.0 L10.0 10.0');
});

// ---- following one stroke ---------------------------------------------------------------------

const TOL = 14;
/** Moves the pencil along a path in steps, optionally pushed sideways. */
function follow(tracker, path, { step = 6, side = 0, from = 0, to = path.length - 1 } = {}) {
  const every = Math.max(1, Math.round(step / SPACING));
  let last = null;
  for (let i = from; i <= to; i++) {
    if (i % every !== 0 && i !== to) continue;
    last = tracker.move([path[i][0], path[i][1] + side]);
    if (last.done) break;
  }
  return last;
}
const across = resample(line(20, 100, 220, 100));

test('a stroke followed from start to end is finished and was on the path all the way', () => {
  const t = new StrokeTracker(across, { tolerance: TOL });
  assert.equal(t.status, 'idle');
  assert.deepEqual(t.start([22, 104]), { accepted: true });
  assert.equal(t.status, 'tracing');
  const last = follow(t, across);
  assert.equal(last.done, true);
  assert.equal(t.status, 'done');
  assert.equal(t.fraction, 1);
  assert.ok(t.accuracy > 0.99, `accuracy ${t.accuracy}`);
  assert.deepEqual(t.position, across.at(-1));
  assert.deepEqual(t.end(), { completed: true, gaveUp: false });
  assert.equal(t.move([0, 0]).done, true, 'nothing changes once finished');
});

test('the progress marker (the snail) only moves while the pencil is on the path', () => {
  const t = new StrokeTracker(across, { tolerance: TOL });
  t.start([20, 100]);
  follow(t, across, { to: 40 });
  const here = t.fraction;
  assert.ok(here > 0.3 && here < 0.7);
  const off = t.move([120, 160]);
  assert.deepEqual({ onPath: off.onPath, progressed: off.progressed }, { onPath: false, progressed: false });
  t.move([200, 170]);
  t.move([210, 100]);
  assert.equal(t.fraction, here, 'jumping ahead does not count');
  t.move(across[40]);
  const resumed = follow(t, across, { from: 40 });
  assert.equal(resumed.done, true);
  assert.ok(t.accuracy < 0.9, `the stray part lowers the accuracy (${t.accuracy})`);
  assert.ok(t.accuracy > 0.3);
});

test('a pencil that is only a little off the path still counts, a long way off does not', () => {
  const ok = new StrokeTracker(across, { tolerance: TOL });
  ok.start([20, 100]);
  assert.equal(follow(ok, across, { side: TOL - 2 }).done, true);
  assert.ok(ok.accuracy > 0.99);
  const bad = new StrokeTracker(across, { tolerance: TOL });
  bad.start([20, 100]);
  follow(bad, across, { side: TOL + 8 });
  assert.equal(bad.status, 'tracing');
  assert.equal(bad.fraction, 0);
});

test('sweeping straight across a wave, within reach of its crests, does not carry the snail along it', () => {
  const wave = resample(Array.from({ length: 80 }, (_, i) => [8 + i, 65 + 26 * Math.sin((i / 80) * Math.PI * 4)]));
  const t = new StrokeTracker(wave, { tolerance: 18 });
  t.start(wave[0]);
  for (let x = 12; x <= 90; x += 4) t.move([x, 66 + 22 * 0]);
  assert.notEqual(t.status, 'done');
  assert.ok(t.fraction < 0.75, `a straight sweep got ${t.fraction} of the way`);
  const honest = new StrokeTracker(wave, { tolerance: 18 });
  honest.start(wave[0]);
  for (let i = 1; i < wave.length; i += 2) honest.move(wave[i]);
  assert.equal(honest.status, 'done', 'following the wave does finish it');
  // Wandering a long way with the pencil, off the path, cannot bring progress either.
  const wanderer = new StrokeTracker(across, { tolerance: 14 });
  wanderer.start(across[0]);
  for (let i = 0; i < 30; i++) wanderer.move([20 + (i % 2) * 6, 100 + (i % 2) * 6]);
  assert.ok(wanderer.fraction < 0.2, `jiggling on the spot got ${wanderer.fraction}`);
});

test('a fast pencil is checked all the way, not only where a point was reported', () => {
  const t = new StrokeTracker(across, { tolerance: TOL });
  t.start([20, 100]);
  let result = null;
  for (let x = 40; x <= 220; x += 20) { result = t.move([x, 100]); if (result.done) break; }
  assert.equal(result.done, true, 'jumps of 20 units still follow the path');
  assert.ok(t.accuracy > 0.99);
  const skipper = new StrokeTracker(across, { tolerance: TOL });
  skipper.start([20, 100]);
  skipper.move([40, 100]);
  skipper.move([180, 130]);
  skipper.move([220, 100]);
  assert.notEqual(skipper.status, 'done', 'cutting the corner is not following the stroke');
});

test('starting: near the start is right; at the end is the wrong direction; elsewhere is too far', () => {
  const t = new StrokeTracker(across, { tolerance: TOL });
  assert.deepEqual(t.start([220, 100]), { accepted: false, reason: 'wrong-end' });
  assert.deepEqual(t.start([120, 100]), { accepted: false, reason: 'too-far' });
  assert.deepEqual(t.start([20, 100 + TOL * START_FACTOR + 5]), { accepted: false, reason: 'too-far' });
  assert.equal(t.status, 'idle');
  assert.deepEqual(t.start([20 + TOL, 100]), { accepted: true });
});

test('a loop that ends where it began has no wrong end', () => {
  const circle = resample(arc(100, 100, 40, 40, 270, 630));
  const t = new StrokeTracker(circle, { tolerance: TOL });
  assert.deepEqual(t.start(circle[0]), { accepted: true });
  assert.equal(follow(t, circle).done, true, 'a whole circle is followed');
  const half = new StrokeTracker(circle, { tolerance: TOL });
  half.start(circle[0]);
  for (let i = 0; i <= circle.length / 2; i += 2) half.move(circle[i]);
  assert.ok(half.fraction > 0.4 && half.fraction < 0.6);
  half.move(circle.at(-3));
  assert.ok(half.fraction < 0.7, 'cutting across a circle to its end does not finish it');
  assert.equal(half.status, 'tracing');
});

test('lifting the pencil early gives the stroke up, and it starts again from the beginning', () => {
  const t = new StrokeTracker(across, { tolerance: TOL });
  t.start([20, 100]);
  follow(t, across, { to: 30 });
  assert.ok(t.fraction > 0.2);
  assert.deepEqual(t.end(), { completed: false, gaveUp: true });
  assert.equal(t.status, 'idle');
  assert.equal(t.fraction, 0);
  assert.equal(t.failures, 1);
  assert.deepEqual(t.end(), { completed: false, gaveUp: false }, 'lifting a pencil that is not down does nothing');
  assert.deepEqual(t.start([20, 100]), { accepted: true });
  follow(t, across);
  assert.equal(t.status, 'done');
  assert.equal(t.failures, 1, 'the failure is remembered');
});

test('a move before the pencil is down does nothing', () => {
  const t = new StrokeTracker(across, { tolerance: TOL });
  assert.deepEqual(t.move([100, 100]), { onPath: false, progressed: false, done: false });
});

test('a stroke needs two points and a tolerance above zero', () => {
  assert.equal(codeOf(() => new StrokeTracker([[0, 0]], { tolerance: 10 })), 'BAD_PATH');
  assert.equal(codeOf(() => new StrokeTracker([[0, 0], [100, 0]], { tolerance: 10 })), 'BAD_PATH', 'a line given by its two ends has not been evened out');
  assert.equal(codeOf(() => new StrokeTracker(across, { tolerance: 0 })), 'BAD_TOLERANCE');
  assert.equal(codeOf(() => new StrokeTracker(across, { tolerance: NaN })), 'BAD_TOLERANCE');
});

test('strokeScore: the share on the path, less a tenth for each time it was given up', () => {
  assert.equal(strokeScore(1, 0), 1);
  assert.ok(close(strokeScore(0.9, 1), 0.8));
  assert.equal(strokeScore(0.2, 5), 0);
  assert.equal(strokeScore(1.4, 0), 1);
});

// ---- following a letter -----------------------------------------------------------------------

/** An "A" in two strokes: down the left, then down the right. */
const twoStrokes = () => [resample(line(40, 20, 20, 110)), resample(line(70, 20, 90, 110))];
function writeStroke(g, path) {
  assert.equal(g.pointerDown(path[0]).type, 'started');
  let event = null;
  for (let i = 1; i < path.length; i += 2) { event = g.pointerMove(path[i]); if (event.type !== 'progress') break; }
  if (event.type === 'progress') g.pointerUp();
  return event;
}

test('a letter is written stroke by stroke, in order, and finishes when the last one is done', () => {
  const strokes = twoStrokes();
  const g = new GlyphTracer(strokes, { tolerance: TOL });
  assert.deepEqual([g.current, g.done, g.strokeCount], [0, false, 2]);
  assert.deepEqual(writeStroke(g, strokes[0]), { type: 'stroke-done', stroke: 0 });
  assert.equal(g.current, 1);
  assert.deepEqual(g.pointerUp(), { type: 'ignored' }, 'nothing is down after a stroke is done');
  assert.deepEqual(writeStroke(g, strokes[1]), { type: 'glyph-done' });
  assert.equal(g.done, true);
  assert.equal(g.pointerDown(strokes[0][0]).type, 'ignored');
  const r = g.results();
  assert.deepEqual([r.orderMistakes, r.directionMistakes], [0, 0]);
  assert.ok(r.score > 0.98, `score ${r.score}`);
  assert.equal(r.strokes.length, 2);
});

test('starting the second stroke first is a mistake in the order, and nothing is drawn', () => {
  const strokes = twoStrokes();
  const g = new GlyphTracer(strokes, { tolerance: TOL });
  assert.deepEqual(g.pointerDown(strokes[1][0]), { type: 'wrong-order', stroke: 1 });
  assert.equal(g.pointerMove(strokes[1][5]), null, 'the pencil is not down');
  assert.equal(g.current, 0);
  assert.equal(g.results().orderMistakes, 1);
});

test('starting a stroke at its end is the wrong direction; starting anywhere else is just far', () => {
  const strokes = twoStrokes();
  const g = new GlyphTracer(strokes, { tolerance: TOL });
  assert.deepEqual(g.pointerDown(strokes[0].at(-1)), { type: 'wrong-direction' });
  assert.deepEqual(g.pointerDown([150, 60]), { type: 'far' });
  const r = g.results();
  assert.deepEqual([r.orderMistakes, r.directionMistakes], [0, 1], 'being far from everything costs nothing');
});

test('lifting early makes the child write that stroke again; the glyph is not finished', () => {
  const strokes = twoStrokes();
  const g = new GlyphTracer(strokes, { tolerance: TOL });
  g.pointerDown(strokes[0][0]);
  for (let i = 1; i < 12; i += 2) g.pointerMove(strokes[0][i]);
  assert.deepEqual(g.pointerUp(), { type: 'gave-up', stroke: 0 });
  assert.equal(g.current, 0);
  assert.equal(g.done, false);
  assert.equal(g.pointerDown(strokes[0][0]).type, 'started');
  assert.equal(g.pointerDown(strokes[0][0]).type, 'ignored', 'a second finger while the pencil is down');
  assert.equal(g.results().strokes[0].failures, 1);
});

test('the score counts the share on the path, strokes given up and mistakes; mistakes are capped', () => {
  const strokes = twoStrokes();
  const clean = new GlyphTracer(strokes, { tolerance: TOL });
  writeStroke(clean, strokes[0]);
  writeStroke(clean, strokes[1]);
  const cleanScore = clean.results().score;
  const sloppy = new GlyphTracer(strokes, { tolerance: TOL });
  sloppy.pointerDown(strokes[1][0]);
  sloppy.pointerDown(strokes[0].at(-1));
  sloppy.pointerDown(strokes[0][0]);
  for (let i = 1; i < 10; i += 2) sloppy.pointerMove(strokes[0][i]);
  sloppy.pointerUp();
  writeStroke(sloppy, strokes[0]);
  writeStroke(sloppy, strokes[1]);
  const r = sloppy.results();
  assert.deepEqual([r.orderMistakes, r.directionMistakes, r.strokes[0].failures], [1, 1, 1]);
  assert.ok(r.score < cleanScore - 0.1, `score ${r.score} against ${cleanScore}`);
  assert.ok(close(r.score, ((r.strokes[0].score + r.strokes[1].score) / 2) - 2 * MISTAKE_PENALTY, 1e-9), 'two mistakes at 0.05 each');
  const many = new GlyphTracer(strokes, { tolerance: TOL });
  for (let i = 0; i < 20; i++) many.pointerDown(strokes[1][0]);
  assert.ok(close(MAX_MISTAKE_PENALTY, 0.3));
  assert.equal(many.results().score, 0, 'nothing written and every mistake counted: never below zero');
  assert.equal(codeOf(() => new GlyphTracer([], { tolerance: TOL })), 'BAD_GLYPH');
});

// ---- the demonstration pencil -----------------------------------------------------------------

test('the demonstration writes each stroke in turn at a steady speed, with a rest between', () => {
  const strokes = [resample(line(0, 0, 90, 0)), resample(line(0, 50, 0, 140))];
  const tl = demoTimeline(strokes, { speed: 90, pause: 0.5 });
  assert.equal(tl.segments.length, 2);
  assert.ok(close(tl.segments[0].end - tl.segments[0].start, 1, 0.05));
  assert.ok(close(tl.segments[1].start, tl.segments[0].end + 0.5));
  assert.ok(close(tl.total, tl.segments[1].end + 0.5));
  const at = (t) => demoState(tl, t);
  assert.deepEqual({ ...at(0), distance: Math.round(at(0).distance) }, { stroke: 0, distance: 0, finished: false, pen: true });
  assert.ok(close(at(0.5).distance, 45, 1.5) && at(0.5).stroke === 0);
  assert.equal(at(1.2).stroke, 0);
  assert.equal(at(1.2).pen, false, 'resting between strokes');
  assert.ok(close(at(1.2).distance, 90, 1.5), 'the first stroke stays drawn while resting');
  assert.equal(at(1.6).stroke, 1);
  assert.equal(at(1.6).pen, true);
  assert.equal(at(tl.total - 0.01).finished, false);
  assert.deepEqual({ ...at(tl.total), distance: Math.round(at(tl.total).distance) }, { stroke: 1, distance: 90, finished: true, pen: false });
  assert.equal(at(999).finished, true);
});
