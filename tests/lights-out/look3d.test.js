import test from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import { toggle, createBoard } from '../../src/games/lights-out/logic/board.js';
import {
  CELL, cellPosition, boardWidth, changedCells, startView, viewLimits, bounce, BOUNCE_SECONDS, fireflyFlights, flightProgress, FLIGHT_SECONDS,
} from '../../src/games/lights-out/logic/look3d.js';

const SIZES = [3, 4, 5];
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

test('every jar has its own place, centred on the origin, spaced evenly', () => {
  for (const size of SIZES) {
    const seen = new Set();
    let sx = 0;
    let sz = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const { x, z } = cellPosition(r, c, size);
        seen.add(`${x.toFixed(6)},${z.toFixed(6)}`);
        sx += x;
        sz += z;
      }
    }
    assert.equal(seen.size, size * size);
    near(sx, 0);
    near(sz, 0);
    near(cellPosition(0, 1, size).x - cellPosition(0, 0, size).x, CELL);
    near(cellPosition(1, 0, size).z - cellPosition(0, 0, size).z, CELL);
  }
});

test('row 0 is at the back (the top of the picture) and column 0 on the left, as in the flat grid', () => {
  for (const size of SIZES) {
    const corner = cellPosition(0, 0, size);
    assert.ok(corner.x < 0 && corner.z < 0, 'back left');
    const far = cellPosition(size - 1, size - 1, size);
    assert.ok(far.x > 0 && far.z > 0, 'front right');
  }
});

test('a place off the board is refused, and so is a board with no size', () => {
  throwsCode(() => cellPosition(3, 0, 3), 'OUT_OF_BOARD');
  throwsCode(() => cellPosition(0, -1, 3), 'OUT_OF_BOARD');
  throwsCode(() => cellPosition(0.5, 0, 3), 'OUT_OF_BOARD');
  throwsCode(() => cellPosition(0, 0, 0), 'BAD_BOARD_SIZE');
  throwsCode(() => startView(NaN), 'BAD_BOARD_SIZE');
});

test('the board is wide enough to hold its outer jars with a margin', () => {
  for (const size of SIZES) {
    const edge = Math.abs(cellPosition(0, 0, size).x);
    assert.ok(boardWidth(size) / 2 > edge, 'the outer jars are inside');
  }
});

test('the jars that change after a tap are the tapped jar and its neighbours that exist: five, four or three', () => {
  const empty = createBoard(5);
  assert.equal(changedCells(empty, toggle(empty, 2, 2)).length, 5);
  assert.equal(changedCells(empty, toggle(empty, 0, 2)).length, 4);
  assert.equal(changedCells(empty, toggle(empty, 0, 0)).length, 3);
  assert.deepEqual(changedCells(empty, toggle(empty, 0, 0)), [[0, 0], [0, 1], [1, 0]]);
  assert.deepEqual(changedCells(empty, empty), []);
  const once = toggle(empty, 2, 2);
  assert.equal(changedCells(once, toggle(once, 2, 2)).length, 5, 'tapping twice flips the same five back');
});

test('a bigger board is seen from further back, and the camera limits always allow the starting view', () => {
  const distances = SIZES.map((size) => startView(size).distance);
  assert.ok(distances[0] < distances[1] && distances[1] < distances[2]);
  for (const size of SIZES) {
    const { polar, distance } = startView(size);
    const limits = viewLimits(size);
    assert.ok(polar >= limits.minPolar && polar <= limits.maxPolar);
    assert.ok(distance >= limits.minDistance && distance <= limits.maxDistance);
    assert.ok(limits.maxPolar < Math.PI / 2, 'never under the table');
  }
});

test('a bounce goes up and comes back down, and is exactly zero before it starts and after it ends', () => {
  assert.equal(bounce(0), 0);
  assert.equal(bounce(-1), 0);
  assert.equal(bounce(BOUNCE_SECONDS), 0);
  assert.equal(bounce(5), 0);
  const heights = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map(bounce);
  assert.ok(heights.every((h) => h > 0));
  assert.ok(Math.max(...heights) > 0.1);
});

test('the fireflies fly the same way every time for the same seed, and each has somewhere to go', () => {
  const a = fireflyFlights({ count: 12, seed: 9 });
  assert.deepEqual(a, fireflyFlights({ count: 12, seed: 9 }));
  assert.notDeepEqual(a, fireflyFlights({ count: 12, seed: 10 }));
  assert.equal(a.length, 12);
  for (const f of a) assert.ok(f.rise >= 3 && f.delay >= 0 && f.delay < 0.4);
});

test('a flight stays at the start until its delay is over, then moves, and stays at the end', () => {
  assert.equal(flightProgress(0, 0.2), 0);
  assert.equal(flightProgress(0.2, 0.2), 0);
  const mid = flightProgress(1, 0.2);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(flightProgress(FLIGHT_SECONDS, 0.3), 1);
  assert.equal(flightProgress(99, 0), 1);
  assert.ok(flightProgress(1.2, 0.2) > flightProgress(0.8, 0.2));
});
