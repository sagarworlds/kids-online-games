import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameLoop } from '../../src/engine/GameLoop.js';
import { SceneManager } from '../../src/engine/SceneManager.js';
import { Scene } from '../../src/engine/Scene.js';
import { InputService } from '../../src/engine/services/InputService.js';

// ---- GameLoop --------------------------------------------------------------

function fakeRaf() {
  let next = 1;
  const pending = new Map();
  return {
    raf: (cb) => { const id = next++; pending.set(id, cb); return id; },
    caf: (id) => pending.delete(id),
    /** Runs the next scheduled frame at the given timestamp (ms). */
    tick(ms) {
      const [id, cb] = pending.entries().next().value ?? [];
      if (!cb) return false;
      pending.delete(id);
      cb(ms);
      return true;
    },
    get pending() { return pending.size; },
  };
}

test('GameLoop clamps dt to 50 ms and never passes a negative step', () => {
  const f = fakeRaf();
  const loop = new GameLoop({ raf: f.raf, caf: f.caf });
  const dts = [];
  loop.start({ update: (dt) => dts.push(dt), render() {}, onError() {} });
  f.tick(1000);   // first frame: dt 0
  f.tick(1016);   // normal 16 ms frame
  f.tick(6016);   // 5 s stall (backgrounded tab)
  f.tick(6000);   // clock went backwards
  assert.deepEqual(dts.map((d) => +d.toFixed(3)), [0, 0.016, 0.05, 0]);
});

test('GameLoop stops and reports when a frame throws', () => {
  const f = fakeRaf();
  const loop = new GameLoop({ raf: f.raf, caf: f.caf });
  const errors = [];
  loop.start({ update() { throw new Error('boom'); }, render() {}, onError: (e) => errors.push(e.message) });
  f.tick(0);
  assert.deepEqual(errors, ['boom']);
  assert.equal(loop.running, false);
  assert.equal(f.pending, 0, 'no further frame is scheduled');
});

test('GameLoop.stop cancels the pending frame and start is idempotent', () => {
  const f = fakeRaf();
  const loop = new GameLoop({ raf: f.raf, caf: f.caf });
  const h = { update() {}, render() {}, onError() {} };
  loop.start(h);
  loop.start(h);
  assert.equal(f.pending, 1);
  loop.stop();
  loop.stop();
  assert.equal(f.pending, 0);
  assert.equal(loop.running, false);
});

// ---- SceneManager ----------------------------------------------------------

class Recorder extends Scene {
  constructor(name, log) { super({}); this.name = name; this.log = log; }
  enter(params) { this.log.push(`${this.name}:enter:${JSON.stringify(params ?? null)}`); }
  exit() { this.log.push(`${this.name}:exit`); }
  pause() { this.log.push(`${this.name}:pause`); }
  resume() { this.log.push(`${this.name}:resume`); }
  update(dt) { this.log.push(`${this.name}:update:${dt}`); }
  render() { this.log.push(`${this.name}:render`); }
  resize(w, h) { this.log.push(`${this.name}:resize:${w}x${h}`); }
}

test('SceneManager push pauses the scene below and pop resumes it', () => {
  const log = [];
  const m = new SceneManager();
  m.resize(800, 600);
  m.push(new Recorder('A', log), { level: 'easy' });
  m.push(new Recorder('B', log));
  m.update(0.01);
  m.render(null);
  m.pop();
  assert.deepEqual(log, [
    'A:enter:{"level":"easy"}', 'A:resize:800x600',
    'A:pause', 'B:enter:null', 'B:resize:800x600',
    'B:update:0.01', 'B:render',
    'B:exit', 'A:resume', 'A:resize:800x600',
  ]);
  assert.equal(m.depth, 1);
});

test('SceneManager.replace exits the old scene before entering the new one', () => {
  const log = [];
  const m = new SceneManager();
  m.push(new Recorder('Menu', log));
  m.replace(new Recorder('Play', log), { n: 1 });
  assert.deepEqual(log.filter((l) => !l.includes('resize')), ['Menu:enter:null', 'Menu:exit', 'Play:enter:{"n":1}']);
  assert.equal(m.depth, 1);
});

test('SceneManager only updates and renders the top scene', () => {
  const log = [];
  const m = new SceneManager();
  m.push(new Recorder('A', log));
  m.push(new Recorder('B', log));
  log.length = 0;
  m.update(0.02);
  m.render(null);
  assert.deepEqual(log, ['B:update:0.02', 'B:render']);
});

test('SceneManager.pop on an empty stack throws a GameError', () => {
  assert.throws(() => new SceneManager().pop(), { code: 'EMPTY_STACK' });
});

test('SceneManager.clear exits every scene, top first', () => {
  const log = [];
  const m = new SceneManager();
  m.push(new Recorder('A', log));
  m.push(new Recorder('B', log));
  log.length = 0;
  m.clear();
  assert.deepEqual(log, ['B:exit', 'A:exit']);
  assert.equal(m.current, null);
});

test('SceneManager removes the scene DOM even when exit() throws', () => {
  const removed = [];
  const uiRoot = {
    ownerDocument: { createElement: () => ({ hidden: false, remove() { removed.push(1); } }) },
    append() {},
  };
  const m = new SceneManager({ uiRoot });
  const scene = new Scene({});
  scene.exit = () => { throw new Error('exit failed'); };
  m.push(scene);
  assert.throws(() => m.pop(), /exit failed/);
  assert.equal(removed.length, 1);
});

// ---- InputService ----------------------------------------------------------

/** Builds an Event with extra own properties (`target` is a read-only getter, so assign via defineProperty). */
function makeEvent(type, props = {}) {
  const event = new Event(type);
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
  return event;
}

function inputRig() {
  const target = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 100, top: 50 }) });
  const keyTarget = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const input = new InputService({ target, keyTarget, doc });
  const pointer = (type, x, y, extra = {}) =>
    target.dispatchEvent(makeEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'touch', target: null, ...extra }));
  return { input, target, keyTarget, doc, pointer };
}

test('a press without movement is a tap with coordinates relative to the target', () => {
  const { input, pointer } = inputRig();
  const taps = [];
  input.on('tap', (e) => taps.push([e.x, e.y]));
  pointer('pointerdown', 130, 90);
  pointer('pointerup', 131, 91);
  assert.deepEqual(taps, [[31, 41]]);
});

test('moving past the threshold produces dragstart, drag, dragend and no tap', () => {
  const { input, pointer } = inputRig();
  const seen = [];
  for (const t of ['tap', 'dragstart', 'drag', 'dragend']) input.on(t, () => seen.push(t));
  pointer('pointerdown', 100, 100);
  pointer('pointermove', 103, 100); // under threshold
  pointer('pointermove', 120, 100);
  pointer('pointermove', 140, 100);
  pointer('pointerup', 140, 100);
  assert.deepEqual(seen, ['dragstart', 'drag', 'drag', 'dragend']);
});

test('secondary mouse buttons and other pointers are ignored', () => {
  const { input, pointer } = inputRig();
  const taps = [];
  input.on('tap', () => taps.push(1));
  pointer('pointerdown', 0, 0, { button: 2 });
  pointer('pointerup', 0, 0, { button: 2 });
  pointer('pointerdown', 0, 0);
  pointer('pointerup', 0, 0, { pointerId: 99 });
  assert.equal(taps.length, 0);
});

test('keys are forwarded, flagged when they come from a button, and skipped in text fields', () => {
  const { input, keyTarget } = inputRig();
  const keys = [];
  input.on('key', (e) => keys.push([e.key, e.fromInteractive]));
  const press = (key, target, mods = {}) =>
    keyTarget.dispatchEvent(makeEvent('keydown', { key, code: key, target, ...mods }));
  const closestTo = (selectorHit) => ({ closest: (sel) => (selectorHit(sel) ? {} : null) });

  press('7', closestTo(() => false));
  press('Enter', closestTo((sel) => sel.startsWith('button')));
  press('9', closestTo((sel) => sel.startsWith('input')));      // typing in a field
  press('Escape', closestTo((sel) => sel === 'dialog'));        // inside a modal dialog
  press('r', closestTo(() => false), { ctrlKey: true });         // browser shortcut
  assert.deepEqual(keys, [['7', false], ['Enter', true]]);
});

test('visibility changes are forwarded and handler errors are isolated', () => {
  const { input, doc } = inputRig();
  const seen = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    input.on('visibility', () => { throw new Error('bad handler'); });
    input.on('visibility', (e) => seen.push(e.hidden));
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(seen, [true]);
});

test('dispose removes DOM listeners and handlers', () => {
  const { input, pointer } = inputRig();
  const taps = [];
  input.on('tap', () => taps.push(1));
  input.dispose();
  pointer('pointerdown', 0, 0);
  pointer('pointerup', 0, 0);
  assert.equal(taps.length, 0);
});
