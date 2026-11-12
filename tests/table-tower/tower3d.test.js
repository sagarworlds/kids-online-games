// The geometry behind Table Tower's 3D view: the tower on the menu (which floors are built, where the camera climbs to) and
// the block slabs that show a split sum. None of it imports three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import { orbitPosition } from '../../src/engine/three/orbitMath.js';
import { LEVELS, LEVEL_IDS, FLOORS, FACTS_PER_FLOOR, floorsOf, isFloorOpen } from '../../src/games/table-tower/logic/levels.js';
import { splitNumber, explainSplit } from '../../src/games/table-tower/logic/splits.js';
import {
  FLOOR_HEIGHT, FLOOR_GAP, FLOOR_WIDTH, ROOF_HEIGHT, floorBase, floorCenterY, towerHeight, floorStates, focusIndex, climbFraming, wholeTowerFraming,
} from '../../src/games/table-tower/logic/tower3d.js';
import { SLAB_GAP, slabLayout, slabFraming } from '../../src/games/table-tower/logic/slabs3d.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

/** Is a point inside what a camera at `position` looking at `target` sees? */
function visible({ position, target }, aspect, fovDegrees, point) {
  const f = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
  const fl = Math.hypot(f.x, f.y, f.z);
  f.x /= fl; f.y /= fl; f.z /= fl;
  const r = { x: -f.z, y: 0, z: f.x };
  const rl = Math.hypot(r.x, r.z);
  r.x /= rl; r.z /= rl;
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const d = { x: point.x - position.x, y: point.y - position.y, z: point.z - position.z };
  const depth = d.x * f.x + d.y * f.y + d.z * f.z;
  if (depth <= 0.1) return false;
  const half = Math.tan((fovDegrees * Math.PI) / 360);
  return Math.abs((d.x * u.x + d.y * u.y + d.z * u.z) / depth) <= half && Math.abs((d.x * r.x + d.y * r.y + d.z * r.z) / depth) <= half * aspect;
}

// ---- the tower ---------------------------------------------------------------------------------------

test('floors stack from the ground with a small gap, and the tower is as tall as its floors plus a roof', () => {
  assert.equal(floorBase(0), 0);
  near(floorBase(1), FLOOR_HEIGHT + FLOOR_GAP);
  near(floorCenterY(0), FLOOR_HEIGHT / 2);
  near(floorCenterY(3) - floorCenterY(2), FLOOR_HEIGHT + FLOOR_GAP);
  near(towerHeight(10), floorBase(10) + ROOF_HEIGHT);
  assert.ok(towerHeight(11) > towerHeight(10));
});

const open = (cleared) => (floor) => isFloorOpen(floor, cleared);

test('a floor is built when cleared, the next open one is the current one, and the rest are empty frames', () => {
  const floors = floorsOf(LEVELS.easy);
  assert.deepEqual(floorStates({ floors, cleared: new Set(), isOpen: open(new Set()) }), ['current', ...Array(9).fill('locked')]);
  const three = new Set([1, 2, 3]);
  assert.deepEqual(floorStates({ floors, cleared: three, isOpen: open(three) }), ['cleared', 'cleared', 'cleared', 'current', ...Array(6).fill('locked')]);
  const all = new Set(floors);
  assert.deepEqual(floorStates({ floors, cleared: all, isOpen: open(all) }), Array(10).fill('cleared'));
});

test('the tower grows by exactly one floor for each table cleared, on every level', () => {
  for (const id of LEVEL_IDS) {
    const floors = floorsOf(LEVELS[id]);
    for (let n = 0; n <= floors.length; n++) {
      const cleared = new Set(floors.slice(0, n));
      const states = floorStates({ floors, cleared, isOpen: open(cleared) });
      assert.equal(states.filter((s) => s === 'cleared').length, n, `${id}, ${n} cleared`);
      assert.ok(states.filter((s) => s === 'current').length <= 1, 'never two floors being worked on');
      assert.equal(states.filter((s) => s === 'current').length, n < floors.length ? 1 : 0);
    }
  }
});

test('a level\'s first floor is open even when the level below was never cleared, so Medium and Hard can be started', () => {
  for (const id of ['medium', 'hard']) {
    const floors = floorsOf(LEVELS[id]);
    const states = floorStates({ floors, cleared: new Set(), isOpen: open(new Set()) });
    assert.equal(states[0], 'current');
    assert.ok(states.slice(1).every((s) => s === 'locked'));
  }
});

test('the camera climbs to the floor being worked on, or the top of what is built when everything is cleared', () => {
  assert.equal(focusIndex(['cleared', 'cleared', 'current', 'locked']), 2);
  assert.equal(focusIndex(['current', 'locked', 'locked']), 0);
  assert.equal(focusIndex(['cleared', 'cleared', 'cleared']), 2);
  assert.equal(focusIndex(['locked', 'locked']), 0, 'nothing built: the bottom');
});

test('the climbing camera is higher for a higher floor, looks a little above it, and always has the floor and the one above in view', () => {
  const count = 10;
  let last = -1;
  for (let index = 0; index < count; index++) {
    const frame = climbFraming({ index, count, aspect: 1 });
    assert.ok(frame.target.y > last, 'each floor is higher than the one before');
    last = frame.target.y;
    assert.ok(frame.target.y >= floorCenterY(index) - 1e-9, 'aimed at or above the floor');
    for (const aspect of [0.5, 0.76, 1, 1.8]) {
      const f = climbFraming({ index, count, aspect });
      const camera = { position: orbitPosition({ azimuth: 0, polar: 1.35, distance: f.distance }, f.target), target: f.target };
      for (const i of [index, Math.min(count - 1, index + 1)]) {
        for (const x of [-FLOOR_WIDTH / 2, FLOOR_WIDTH / 2]) {
          assert.ok(visible(camera, aspect, 45, { x, y: floorCenterY(i), z: FLOOR_WIDTH / 2 }), `floor ${i} edge ${x} with the camera on floor ${index} at aspect ${aspect}`);
        }
      }
    }
  }
  assert.ok(climbFraming({ index: 2, count: 10, aspect: 0.5 }).distance > climbFraming({ index: 2, count: 10, aspect: 1.8 }).distance, 'a narrow phone stands farther back');
  assert.ok(Number.isFinite(climbFraming({ index: 0, count: 10, aspect: NaN }).distance));
});

test('the whole-tower view fits the tallest tower on a tall phone and a wide screen', () => {
  for (const count of [1, 10, 30]) {
    for (const aspect of [0.5, 0.76, 1.8]) {
      const frame = wholeTowerFraming({ count, aspect });
      const camera = { position: orbitPosition({ azimuth: 0, polar: Math.PI / 2, distance: frame.distance }, frame.target), target: frame.target };
      for (const y of [0, towerHeight(count)]) assert.ok(visible(camera, aspect, 45, { x: 0, y, z: 0 }), `the ${y === 0 ? 'bottom' : 'top'} of ${count} floors at aspect ${aspect}`);
      for (const x of [-FLOOR_WIDTH / 2, FLOOR_WIDTH / 2]) assert.ok(visible(camera, aspect, 45, { x, y: towerHeight(count) / 2, z: 0 }), `the tower's width at aspect ${aspect}`);
    }
  }
});

// ---- the slabs ---------------------------------------------------------------------------------------

test('the slabs for 17 x 6 are a 10 x 6 slab and a 7 x 6 slab, side by side, whose products add to the whole', () => {
  const { slabs, totalWidth } = slabLayout({ factors: splitNumber(17), rows: 6 });
  assert.deepEqual(slabs.map((s) => [s.factor, s.rows, s.product]), [[10, 6, 60], [7, 6, 42]]);
  assert.equal(slabs.reduce((sum, s) => sum + s.product, 0), 17 * 6);
  near(totalWidth, 17 + SLAB_GAP);
});

test('for every table and every number of rows the slabs match the working on screen and the row is centred', () => {
  for (let table = 1; table <= FLOORS; table++) {
    for (let rows = 1; rows <= FACTS_PER_FLOOR; rows++) {
      const explained = explainSplit(table, rows);
      const { slabs, totalWidth } = slabLayout({ factors: splitNumber(table), rows });
      assert.deepEqual(slabs.map((s) => s.product), explained.parts.map((p) => p.product), `${table} x ${rows}`);
      assert.equal(slabs.reduce((sum, s) => sum + s.product, 0), explained.total);
      assert.equal(slabs.reduce((sum, s) => sum + s.width, 0), table, 'the widths add up to the table');
      // Centred: the left edge of the first slab and the right edge of the last are the same distance from 0.
      near(slabs[0].x - slabs[0].width / 2, -(slabs.at(-1).x + slabs.at(-1).width / 2), 1e-9);
      near(totalWidth, 2 * (slabs.at(-1).x + slabs.at(-1).width / 2), 1e-9);
      // No two slabs overlap, and there is a gap between neighbours.
      for (let i = 1; i < slabs.length; i++) near((slabs[i].x - slabs[i].width / 2) - (slabs[i - 1].x + slabs[i - 1].width / 2), SLAB_GAP, 1e-9);
    }
  }
});

test('bad slabs are refused', () => {
  for (const bad of [{ factors: [], rows: 3 }, { factors: [0, 3], rows: 3 }, { factors: [2.5], rows: 3 }, { factors: [3], rows: 0 }, { factors: [3], rows: 1.5 }, { factors: null, rows: 3 }]) {
    throwsCode(() => slabLayout(bad), 'BAD_SLABS');
  }
});

test('the camera sees every slab corner for any table and number of rows, on a tall phone and a wide screen', () => {
  for (const aspect of [0.5, 0.76, 1.2, 2]) {
    for (let table = 1; table <= FLOORS; table++) {
      for (const rows of [1, 6, 10]) {
        const { slabs, totalWidth } = slabLayout({ factors: splitNumber(table), rows });
        const frame = slabFraming({ totalWidth, rows, aspect });
        const camera = { position: orbitPosition(frame, { x: 0, y: 0, z: 0 }), target: { x: 0, y: 0, z: 0 } };
        for (const s of slabs) {
          for (const x of [s.x - s.width / 2, s.x + s.width / 2]) {
            for (const z of [-s.depth / 2, s.depth / 2]) assert.ok(visible(camera, aspect, 45, { x, y: 0, z }), `${table} x ${rows}, slab ${s.index} corner (${x}, ${z}) at aspect ${aspect}`);
          }
        }
      }
    }
  }
  assert.ok(slabFraming({ totalWidth: 31.4, rows: 6, aspect: 1 }).distance > slabFraming({ totalWidth: 10, rows: 6, aspect: 1 }).distance, 'a wider row needs the camera farther back');
});
