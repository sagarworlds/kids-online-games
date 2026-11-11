// The pure parts of the 3D layer: device support, quality, the orbit camera maths and the saved view choice.
// Nothing here imports three.js itself, which needs a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hasWebGL2, pickQuality, resolveViewMode } from '../../src/engine/three/support.js';
import { clampOrbit, orbitPosition, pinchGap, rotateOrbit, zoomOrbit } from '../../src/engine/three/orbitMath.js';
import { readViewPreference, saveViewPreference } from '../../src/engine/three/viewPreference.js';
import { createViewChoice } from '../../src/engine/three/view.js';
import { StorageService, createMemoryBackend } from '../../src/engine/services/StorageService.js';
import { gameKey, saveSchema } from '../../src/engine/services/schemas.js';
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

test('createViewChoice: 3D by default, the child can pick 2D, and a 3D failure falls back without saving', () => {
  const storage = newStorage();
  const view = createViewChoice({ storage, slug: 'robot-path', supported: true });
  assert.equal(view.mode(), '3d');
  view.fallBack();
  assert.equal(view.mode(), '2d');
  assert.equal(readViewPreference(storage, 'robot-path'), null, 'the fallback is for this visit only');

  const again = createViewChoice({ storage, slug: 'robot-path', supported: true });
  again.choose('2d');
  assert.equal(again.mode(), '2d');
  again.choose('3d');
  assert.equal(again.mode(), '3d');

  assert.equal(createViewChoice({ storage, slug: 'robot-path', supported: false }).mode(), '2d');
});
