import test from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import {
  CARRIAGE_LENGTH, CARRIAGE_GAP, ROW_SPACING, rowsFor, placePosition, startView, LEAVE_SECONDS, trainOffset, wrongBounce, DROP_SECONDS, dropHeight, steamPuff,
  fitFontSize,
} from '../../src/games/sentence-train/logic/look3d.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);
const COUNTS = [4, 6, 8, 11]; // engine + 3 to 10 words, and the longest Hard sentence with its engine
const ASPECTS = [1.0, 1.2, 1.6, 2.2];

test('a train is the engine and at least one carriage, and a place that is not on it is refused', () => {
  throwsCode(() => rowsFor(1, 1.5), 'BAD_TRAIN_LENGTH');
  throwsCode(() => placePosition(0, 0, 1.5), 'BAD_TRAIN_LENGTH');
  throwsCode(() => placePosition(5, 5, 1.5), 'NO_SUCH_PLACE');
  throwsCode(() => placePosition(-1, 5, 1.5), 'NO_SUCH_PLACE');
});

test('every place gets a row, the rows are even (never a lone carriage on the last one) and no row is longer than the picture can show', () => {
  for (const count of COUNTS) {
    for (const aspect of ASPECTS) {
      const { perRow, rows } = rowsFor(count, aspect);
      assert.ok(perRow * rows >= count && perRow * (rows - 1) < count, `${count} places at ${aspect}`);
      const lastRow = count - perRow * (rows - 1);
      assert.ok(rows === 1 || lastRow >= Math.floor(perRow / 2), 'the last row is not nearly empty');
      assert.ok(perRow <= (aspect >= 1.9 ? 12 : aspect >= 1.5 ? 8 : aspect >= 1.25 ? 5 : 4));
    }
  }
  // A short sentence on a wide picture is one straight train; a long one on a narrow picture runs on in further rows.
  assert.equal(rowsFor(5, 2.2).rows, 1);
  assert.ok(rowsFor(11, 1.0).rows >= 3);
});

test('the engine is first at the back left of the first row, and the carriages follow in reading order: along the row, then the next row (nearer)', () => {
  for (const count of COUNTS) {
    for (const aspect of ASPECTS) {
      const { perRow } = rowsFor(count, aspect);
      const spots = Array.from({ length: count }, (_, i) => placePosition(i, count, aspect));
      assert.equal(spots[0].row, 0);
      assert.equal(spots[0].col, 0);
      for (let i = 1; i < count; i++) {
        if (spots[i].row === spots[i - 1].row) {
          assert.ok(spots[i].x > spots[i - 1].x, 'to the right');
          near(spots[i].x - spots[i - 1].x, CARRIAGE_LENGTH + CARRIAGE_GAP);
        } else {
          assert.equal(spots[i].row, spots[i - 1].row + 1);
          assert.equal(spots[i].col, 0, 'a new row starts at the left');
          assert.ok(spots[i].z > spots[i - 1].z, 'a row nearer the camera');
          near(spots[i].z - spots[i - 1].z, ROW_SPACING);
        }
      }
      // The whole yard is centred.
      const xs = spots.map((s) => s.x);
      near((Math.min(...xs) + Math.max(...xs)) / 2, 0, (perRow * (CARRIAGE_LENGTH + CARRIAGE_GAP)) / 2);
      near(spots.reduce((s, p) => s + p.z, 0) / count, 0, ROW_SPACING);
    }
  }
});

test('no two places are on the same spot, so no two carriages overlap', () => {
  for (const count of COUNTS) for (const aspect of ASPECTS) {
    const keys = new Set(Array.from({ length: count }, (_, i) => { const p = placePosition(i, count, aspect); return `${p.x.toFixed(3)},${p.z.toFixed(3)}`; }));
    assert.equal(keys.size, count);
  }
});

test('a longer train, or more rows, or a narrower picture, is seen from further back', () => {
  assert.ok(startView(11, 1.6).distance >= startView(6, 1.6).distance);
  assert.ok(startView(8, 1.0).distance >= startView(8, 2.2).distance);
  for (const count of COUNTS) for (const aspect of ASPECTS) {
    const { distance, polar } = startView(count, aspect);
    assert.ok(distance >= 11 && polar > 0.5 && polar < 1.5);
  }
  throwsCode(() => startView(1, 1.5), 'BAD_TRAIN_LENGTH');
});

test('the train starts at rest, jolts back a little, then speeds up and ends well out of the picture; it never turns back after the jolt', () => {
  assert.equal(trainOffset(0), 0);
  assert.equal(trainOffset(-5), 0);
  assert.ok(trainOffset(LEAVE_SECONDS * 0.15) < 0, 'the jolt backwards');
  assert.ok(trainOffset(LEAVE_SECONDS) > 40, 'out of the picture');
  assert.equal(trainOffset(LEAVE_SECONDS), trainOffset(99));
  let last = trainOffset(LEAVE_SECONDS * 0.15);
  for (let age = LEAVE_SECONDS * 0.2; age <= LEAVE_SECONDS; age += 0.05) {
    const next = trainOffset(age);
    assert.ok(next >= last - 1e-9, 'always rolling on');
    last = next;
  }
  const speed = (a) => trainOffset(a + 0.1) - trainOffset(a);
  assert.ok(speed(1.5) > speed(0.6), 'quicker and quicker');
});

test('a carriage in the wrong place bounces up and down and is still at the start and the end', () => {
  assert.equal(wrongBounce(0), 0);
  assert.equal(wrongBounce(1), 0);
  assert.equal(wrongBounce(7), 0);
  assert.equal(wrongBounce(-1), 0);
  const heights = [0.1, 0.2, 0.25, 0.4, 0.6, 0.75].map(wrongBounce);
  assert.ok(Math.max(...heights) > 0.2 && heights.every((h) => h >= 0));
});

test('a carriage put in a slot is lowered from above and lands exactly on the track', () => {
  assert.ok(dropHeight(0) > 1.5);
  assert.ok(dropHeight(-1) > 1.5);
  assert.equal(dropHeight(DROP_SECONDS), 0);
  assert.equal(dropHeight(9), 0);
  assert.ok(dropHeight(DROP_SECONDS * 0.8) < dropHeight(DROP_SECONDS * 0.4));
});

test('a puff of steam rises, grows and fades away', () => {
  const start = steamPuff(0);
  const end = steamPuff(1.4);
  assert.equal(start.rise, 0);
  assert.ok(start.opacity > 0.5 && end.opacity === 0);
  assert.ok(end.rise > start.rise && end.scale > start.scale);
  assert.deepEqual(steamPuff(99), end);
});

test('a word is written at full size when it fits and smaller when it does not, never below the minimum', () => {
  assert.equal(fitFontSize(100, 60, 200), 60);
  assert.equal(fitFontSize(400, 60, 200), 30);
  assert.equal(fitFontSize(2000, 60, 200), 26);
  assert.equal(fitFontSize(2000, 60, 200, 40), 40);
  assert.equal(fitFontSize(0, 60, 200), 60);
});
