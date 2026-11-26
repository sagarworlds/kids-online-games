// The pure parts of the 3D layer: device support, quality, the orbit camera maths and the saved view choice.
// Nothing here imports three.js itself, which needs a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hasWebGL2, isWeakDevice, pickQuality, resolveViewMode } from '../../src/engine/three/support.js';
import { markDeviceSlow, readDevice } from '../../src/engine/three/deviceVerdict.js';
import { clampOrbit, orbitPosition, pinchGap, rotateOrbit, zoomOrbit } from '../../src/engine/three/orbitMath.js';
import { readViewPreference, saveViewPreference } from '../../src/engine/three/viewPreference.js';
import { createViewChoice } from '../../src/engine/three/view.js';
import { openScreen } from '../../src/engine/three/openView.js';
import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { DEVICE_KEY, deviceSchema, gameKey, saveSchema } from '../../src/engine/services/schemas.js';
import { createLogger } from './helpers.js';

const newStorage = () => new StorageService({ backend: createMemoryBackend(), logger: createLogger(), eventTarget: null });
const LIMITS = { minPolar: 0.2, maxPolar: 1.4, minDistance: 2, maxDistance: 20 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not close to ${b}`);

// ---- support ---------------------------------------------------------------

test('hasWebGL2 is true only when a webgl2 context can be created, and never throws', () => {
  assert.equal(hasWebGL2(() => ({ getContext: (type) => (type === 'webgl2' ? {} : null) })), true);
  assert.equal(hasWebGL2(() => ({ getContext: () => null })), false);
  assert.equal(hasWebGL2(() => { throw new Error('no canvas'); }), false);
});

test('pickQuality lowers detail on weak phones and caps the pixel ratio at 2 elsewhere', () => {
  assert.deepEqual(pickQuality({ deviceMemory: 2, hardwareConcurrency: 8, devicePixelRatio: 3 }), { pixelRatio: 1, antialias: false, shadows: false, detail: 'low' });
  assert.equal(pickQuality({ deviceMemory: 8, hardwareConcurrency: 4, devicePixelRatio: 3 }).detail, 'low');
  assert.deepEqual(pickQuality({ deviceMemory: 8, hardwareConcurrency: 8, devicePixelRatio: 3 }), { pixelRatio: 2, antialias: true, shadows: false, detail: 'high' });
  assert.equal(pickQuality({ devicePixelRatio: 1.5 }).pixelRatio, 1.5);
});

test('pickQuality treats missing or nonsense hints as a capable device', () => {
  assert.equal(pickQuality().detail, 'high');
  assert.equal(pickQuality({ devicePixelRatio: NaN }).pixelRatio, 1);
  assert.equal(pickQuality({ devicePixelRatio: 0 }).pixelRatio, 1);
});

test('resolveViewMode gives 3D unless the device cannot do it or the child chose 2D', () => {
  assert.equal(resolveViewMode({ supported: true }), '3d');
  assert.equal(resolveViewMode({ supported: true, preference: '3d' }), '3d');
  assert.equal(resolveViewMode({ supported: true, preference: '2d' }), '2d');
  assert.equal(resolveViewMode({ supported: false, preference: '3d' }), '2d');
});

test('resolveViewMode opens flat on a slow device until the child chooses, and the child\'s own choice always wins', () => {
  assert.equal(resolveViewMode({ supported: true, slowDevice: true }), '2d', 'no choice yet: flat on a slow device');
  assert.equal(resolveViewMode({ supported: true, slowDevice: true, preference: '3d' }), '3d', 'the child asked for 3D');
  assert.equal(resolveViewMode({ supported: true, slowDevice: true, preference: '2d' }), '2d');
  assert.equal(resolveViewMode({ supported: true, slowDevice: false }), '3d');
  assert.equal(resolveViewMode({ supported: false, slowDevice: false, preference: '3d' }), '2d', 'a device that cannot do 3D never gets it');
});

test('isWeakDevice is true only for 1 GB or less, or 2 cores or fewer, and treats hidden values as capable', () => {
  assert.equal(isWeakDevice({ deviceMemory: 1 }), true);
  assert.equal(isWeakDevice({ deviceMemory: 0.5 }), true);
  assert.equal(isWeakDevice({ hardwareConcurrency: 2 }), true);
  assert.equal(isWeakDevice({ deviceMemory: 2, hardwareConcurrency: 4 }), false, 'low detail, but not flat by default');
  assert.equal(isWeakDevice({ deviceMemory: 4, hardwareConcurrency: 8 }), false);
  assert.equal(isWeakDevice({}), false, 'Safari and Firefox hide these values');
  assert.equal(isWeakDevice(), false);
  assert.equal(isWeakDevice({ deviceMemory: Number.NaN, hardwareConcurrency: 'many' }), false);
});

// ---- orbit maths -----------------------------------------------------------

test('clampOrbit keeps polar and distance inside the limits and leaves azimuth free by default', () => {
  assert.deepEqual(clampOrbit({ azimuth: 9, polar: 0, distance: 100 }, LIMITS), { azimuth: 9, polar: 0.2, distance: 20 });
  assert.deepEqual(clampOrbit({ azimuth: -9, polar: 3, distance: 0 }, LIMITS), { azimuth: -9, polar: 1.4, distance: 2 });
  assert.equal(clampOrbit({ azimuth: 9, polar: 1, distance: 5 }, { ...LIMITS, minAzimuth: -1, maxAzimuth: 1 }).azimuth, 1);
});

test('rotateOrbit turns by the same angle for the same share of the screen, on any screen size', () => {
  const start = { azimuth: 0, polar: 1, distance: 5 };
  const phone = rotateOrbit(start, 50, 0, { viewHeight: 400, limits: LIMITS });
  const desktop = rotateOrbit(start, 100, 0, { viewHeight: 800, limits: LIMITS });
  near(phone.azimuth, desktop.azimuth);
  near(phone.azimuth, -Math.PI / 8);
  // Dragging down a very long way stops at the limit instead of flipping over the top.
  assert.equal(rotateOrbit(start, 0, 5000, { viewHeight: 400, limits: LIMITS }).polar, 0.2);
});

test('zoomOrbit scales the distance, respects the limits and ignores bad factors', () => {
  const start = { azimuth: 0, polar: 1, distance: 10 };
  assert.equal(zoomOrbit(start, 0.5, LIMITS).distance, 5);
  assert.equal(zoomOrbit(start, 0.01, LIMITS).distance, 2);
  assert.equal(zoomOrbit(start, 99, LIMITS).distance, 20);
  for (const bad of [0, -1, NaN, Infinity]) assert.equal(zoomOrbit(start, bad, LIMITS), start);
});

test('orbitPosition puts the camera on a sphere around the target', () => {
  const level = orbitPosition({ azimuth: 0, polar: Math.PI / 2, distance: 5 });
  near(level.x, 0); near(level.y, 0); near(level.z, 5);
  const above = orbitPosition({ azimuth: 1, polar: 0, distance: 5 }, { x: 1, y: 2, z: 3 });
  near(above.x, 1); near(above.y, 7); near(above.z, 3);
  const side = orbitPosition({ azimuth: Math.PI / 2, polar: Math.PI / 2, distance: 4 });
  near(side.x, 4); near(side.z, 0);
});

test('pinchGap is the distance between two fingers', () => {
  assert.equal(pinchGap({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

// ---- saved choice ----------------------------------------------------------

test('the view choice is saved inside the game\'s own save data and keeps the rest of it', () => {
  const storage = newStorage();
  assert.equal(readViewPreference(storage, 'planet-hop'), null);
  storage.write(gameKey('planet-hop'), { ...saveSchema.defaults(), bestScore: 7, extra: { unlocked: 3 } });
  saveViewPreference(storage, 'planet-hop', '2d');
  assert.equal(readViewPreference(storage, 'planet-hop'), '2d');
  const save = storage.read(gameKey('planet-hop'), saveSchema);
  assert.equal(save.bestScore, 7);
  assert.equal(save.extra.unlocked, 3);
  assert.equal(readViewPreference(storage, 'robot-path'), null, 'each game has its own choice');
  saveViewPreference(storage, 'planet-hop', 'vr');
  assert.equal(readViewPreference(storage, 'planet-hop'), '2d', 'an unknown mode is ignored');
});

const CAPABLE = { deviceMemory: 8, hardwareConcurrency: 8 }; // a fixed device, so these tests do not depend on the machine they run on

test('createViewChoice: 3D by default, the child can pick 2D, and a 3D failure falls back without saving', () => {
  const storage = newStorage();
  const view = createViewChoice({ storage, slug: 'robot-path', supported: true, hints: CAPABLE });
  assert.equal(view.mode(), '3d');
  view.fallBack();
  assert.equal(view.mode(), '2d');
  assert.equal(readViewPreference(storage, 'robot-path'), null, 'the fallback is for this visit only');

  const again = createViewChoice({ storage, slug: 'robot-path', supported: true, hints: CAPABLE });
  again.choose('2d');
  assert.equal(again.mode(), '2d');
  again.choose('3d');
  assert.equal(again.mode(), '3d');

  assert.equal(createViewChoice({ storage, slug: 'robot-path', supported: false, hints: CAPABLE }).mode(), '2d');
});

test('createViewChoice: a very weak device, or one marked slow, opens flat by default; a saved choice still wins', () => {
  const weak = createViewChoice({ storage: newStorage(), slug: 'lights-out', supported: true, hints: { deviceMemory: 1, hardwareConcurrency: 4 } });
  assert.equal(weak.mode(), '2d');
  weak.choose('3d');
  assert.equal(weak.mode(), '3d', 'the child asked for 3D');

  const storage = newStorage();
  const capable = createViewChoice({ storage, slug: 'lights-out', supported: true, hints: CAPABLE });
  assert.equal(capable.mode(), '3d');
  markDeviceSlow(storage);
  assert.equal(capable.mode(), '2d', 'the next time the choice is read, a device marked slow opens flat');
  const other = createViewChoice({ storage, slug: 'robot-path', supported: true, hints: CAPABLE });
  assert.equal(other.mode(), '2d', 'and so does every other game, since it is the device that is slow');
  other.choose('3d');
  assert.equal(other.mode(), '3d');
});

// ---- device record -----------------------------------------------------------

test('the device record starts as "not slow, speed check on", and marking it slow keeps the developer switch', () => {
  const storage = newStorage();
  assert.deepEqual(readDevice(storage), { version: 1, slow3d: false, frameWatch: 'on' });
  storage.write(DEVICE_KEY, { version: 1, slow3d: false, frameWatch: 'off' });
  markDeviceSlow(storage);
  assert.deepEqual(readDevice(storage), { version: 1, slow3d: true, frameWatch: 'off' });
});

test('a damaged device record is reset instead of being trusted', () => {
  const backend = createMemoryBackend();
  backend.setItem(DEVICE_KEY, JSON.stringify({ version: 1, slow3d: 'yes', frameWatch: 'sometimes' }));
  const storage = new StorageService({ backend, logger: createLogger() });
  assert.deepEqual(readDevice(storage), deviceSchema.defaults());
});

// ---- opening a screen in the chosen view --------------------------------------


/** A fake game: a view choice, a scene manager that records what is opened, and a list of what happened. */
function fakeGame({ mode = '3d' } = {}) {
  const events = [];
  const view = { mode: () => mode, fallBack: () => events.push('fallBack') };
  const scenes = { replace: (scene, params) => events.push(['replace', scene, params]) };
  return { events, view, scenes, base: { view, scenes, where: 'game:3d', open2d: () => events.push('open2d') } };
}

/** Runs `body` with console.error captured, so the expected error logs do not clutter the test output. */
async function capturingErrors(body) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    await body();
  } finally {
    console.error = original;
  }
  return logged;
}

test('openScreen opens the flat screen in 2D mode and never loads the 3D file', async () => {
  const g = fakeGame({ mode: '2d' });
  let loaded = false;
  await openScreen({ ...g.base, params: 1, load: async () => { loaded = true; return {}; }, make: () => 'scene3d' });
  assert.equal(loaded, false, 'the 3D library is not downloaded for a child in the flat view');
  assert.deepEqual(g.events, ['open2d']);
});

test('openScreen loads the 3D module, builds the scene from it and opens it with the given params', async () => {
  const g = fakeGame();
  await openScreen({ ...g.base, params: { level: 'easy' }, load: async () => ({ Scene3D: 'the class' }), make: (module) => `made from ${module.Scene3D}` });
  assert.deepEqual(g.events, [['replace', 'made from the class', { level: 'easy' }]], 'opened once, and no flat screen or fallback');
});

test('openScreen falls back to the flat screen, logs why, and does not touch the child\'s choice when the 3D file will not load', async () => {
  const g = fakeGame();
  const logged = await capturingErrors(() => openScreen({ ...g.base, load: async () => { throw new TypeError('Failed to fetch dynamically imported module'); }, make: () => 'unused' }));
  assert.deepEqual(g.events, ['fallBack', 'open2d']);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /game:3d/);
  assert.match(logged[0], /Failed to fetch dynamically imported module/);
});

test('openScreen falls back when building the scene, or opening it, fails (a device that cannot start 3D)', async () => {
  const building = fakeGame();
  await capturingErrors(() => openScreen({ ...building.base, load: async () => ({}), make: () => { throw new Error('could not build'); } }));
  assert.deepEqual(building.events, ['fallBack', 'open2d']);

  const opening = fakeGame();
  opening.scenes.replace = () => { throw new Error('the scene failed to start'); };
  await capturingErrors(() => openScreen({ ...opening.base, scenes: opening.scenes, load: async () => ({}), make: () => 'scene3d' }));
  assert.deepEqual(opening.events, ['fallBack', 'open2d']);
});

test('openScreen starts the "getting ready" hook for a 3D load and always stops it, whether the load worked or not', async () => {
  for (const succeeds of [true, false]) {
    const g = fakeGame();
    const calls = [];
    await capturingErrors(() => openScreen({
      ...g.base,
      whileLoading: () => { calls.push('start'); return () => calls.push('stop'); },
      load: async () => { calls.push('load'); if (!succeeds) throw new Error('slow and then broken'); return {}; },
      make: () => 'scene3d',
    }));
    assert.deepEqual(calls.slice(0, 3), ['start', 'load', 'stop'], `the hook is stopped as soon as the load ends (${succeeds ? 'worked' : 'failed'})`);
  }
  const flat = fakeGame({ mode: '2d' });
  let started = false;
  await openScreen({ ...flat.base, whileLoading: () => { started = true; return () => {}; }, load: async () => ({}), make: () => 'x' });
  assert.equal(started, false, 'nothing to wait for in the flat view');
});
