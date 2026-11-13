import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FRAME_WATCH_DEFAULTS, createFrameWatch, pixelRatioSteps } from '../../src/engine/three/frameWatch.js';
import { GameError } from '../../src/engine/utils/errors.js';

/** The frame that ends the warm-up is also the first frame of the window, so a verdict can arrive one 60 ms frame before warm-up + window. */
const FIRST_VERDICT_AT_LEAST = FRAME_WATCH_DEFAULTS.warmupMs + FRAME_WATCH_DEFAULTS.windowMs - 60;

/** Feeds `ms` of frames, each `interval` long, and returns every verdict that was not "fine", with the time it came at. */
function play(watch, interval, ms, from = 0) {
  const events = [];
  for (let t = 0; t < ms; t += interval) {
    const verdict = watch.frame(interval);
    if (verdict !== 'fine') events.push({ verdict, at: from + t + interval });
  }
  return events;
}

test('a smooth 3D view is never touched, however long it runs', () => {
  const watch = createFrameWatch();
  assert.deepEqual(play(watch, 16.7, 10 * 60 * 1000), []);
  assert.equal(watch.lowered, 0);
});

test('a slow start is forgiven: shaders compiling and models uploading are not judged', () => {
  const watch = createFrameWatch();
  const startUp = play(watch, 250, FRAME_WATCH_DEFAULTS.warmupMs); // four frames a second, for the warm-up
  const afterwards = play(watch, 16.7, 30_000);
  assert.deepEqual([...startUp, ...afterwards], []);
});

test('a few hiccups in a smooth run do not count, because the verdict is on the middle frame', () => {
  const watch = createFrameWatch();
  let verdicts = [];
  for (let i = 0; i < 6000; i++) {
    const interval = i % 10 === 0 ? 140 : 16.7; // one frame in ten is a long one
    const verdict = watch.frame(interval);
    if (verdict !== 'fine') verdicts.push(verdict);
  }
  assert.deepEqual(verdicts, []);
});

test('a steady crawl lowers the resolution twice and then gives up', () => {
  const watch = createFrameWatch();
  const events = play(watch, 60, 40_000); // about 16 frames a second
  assert.deepEqual(events.map((e) => e.verdict), ['lower', 'lower', 'giveUp']);
  assert.equal(watch.lowered, 2);
  // The first verdict comes after the warm-up and one window, and each later one after the settling time and another window.
  const [first, second, third] = events.map((e) => e.at);
  assert.ok(first >= FIRST_VERDICT_AT_LEAST && first < 6_000, `first verdict at ${first} ms`);
  assert.ok(second - first >= FRAME_WATCH_DEFAULTS.settleMs + FRAME_WATCH_DEFAULTS.windowMs, `second verdict ${second - first} ms later`);
  assert.ok(third - second >= FRAME_WATCH_DEFAULTS.settleMs + FRAME_WATCH_DEFAULTS.windowMs, `third verdict ${third - second} ms later`);
});

test('a hopeless picture gives up at once, without lowering the resolution first', () => {
  const watch = createFrameWatch();
  const events = play(watch, 200, 20_000); // five frames a second
  assert.deepEqual(events.map((e) => e.verdict), ['giveUp']);
  assert.equal(watch.lowered, 0);
});

test('lowering the resolution that fixes the slowness ends the trouble', () => {
  const watch = createFrameWatch();
  const slow = play(watch, 60, 6_000);
  assert.deepEqual(slow.map((e) => e.verdict), ['lower']);
  // After the change the view is fast enough: nothing more happens.
  assert.deepEqual(play(watch, 20, 60_000), []);
  assert.equal(watch.lowered, 1);
});

test('after giving up it says nothing more', () => {
  const watch = createFrameWatch();
  assert.deepEqual(play(watch, 200, 20_000).map((e) => e.verdict), ['giveUp']);
  assert.deepEqual(play(watch, 200, 20_000), []);
});

test('a long gap (the page was hidden or paused) is not slowness and starts the warm-up again', () => {
  const watch = createFrameWatch();
  // Nearly slow enough to be judged, then the tab is hidden for a minute...
  assert.deepEqual(play(watch, 60, 3_000), []);
  assert.equal(watch.frame(60_000), 'fine');
  // ...and what follows is judged only after a new warm-up and window, so the same crawl takes as long to be noticed as on a fresh start.
  const events = play(watch, 60, 8_000);
  assert.equal(events[0]?.verdict, 'lower');
  assert.ok(events[0].at >= FIRST_VERDICT_AT_LEAST, `first verdict at ${events[0].at} ms`);
});

test('intervals that are not positive numbers are ignored', () => {
  const watch = createFrameWatch();
  for (const bad of [0, -5, Number.NaN, Infinity, undefined, null, '16']) assert.equal(watch.frame(bad), 'fine');
  // They did not count towards the warm-up either: a crawl is still judged only after a full warm-up and window.
  const events = play(watch, 60, 8_000);
  assert.ok(events[0].at >= FIRST_VERDICT_AT_LEAST, `first verdict at ${events[0].at} ms`);
});

test('the number of resolution steps is a setting, and zero steps means giving up as soon as it is slow', () => {
  const watch = createFrameWatch({ steps: 0 });
  assert.deepEqual(play(watch, 60, 20_000).map((e) => e.verdict), ['giveUp']);
  const patient = createFrameWatch({ steps: 4 });
  assert.deepEqual(play(patient, 60, 120_000).map((e) => e.verdict), ['lower', 'lower', 'lower', 'lower', 'giveUp']);
});

test('createFrameWatch refuses nonsense settings with a clear error', () => {
  for (const bad of [{ windowMs: 0 }, { slowMs: 0 }, { warmupMs: -1 }, { steps: Number.NaN }, { hopelessMs: 30, slowMs: 45 }, { maxGapMs: 'long' }]) {
    assert.throws(() => createFrameWatch(bad), (error) => error instanceof GameError && error.code === 'BAD_OPTIONS', JSON.stringify(bad));
  }
});

test('pixelRatioSteps goes down a quarter at a time and stops at the floor', () => {
  assert.deepEqual(pixelRatioSteps(1, 2), [1, 0.75, 0.5]);
  assert.deepEqual(pixelRatioSteps(2, 2), [2, 1.5, 1]);
  assert.deepEqual(pixelRatioSteps(1, 5), [1, 0.75, 0.5], 'never below 0.5');
  assert.deepEqual(pixelRatioSteps(0.5, 2), [0.5], 'nothing left to lower: the view gives up at the first slow verdict');
  assert.deepEqual(pixelRatioSteps(1.5, 0), [1.5]);
  assert.deepEqual(pixelRatioSteps(1, 2, 0.8), [1], 'a higher floor');
});
