import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import { LEAST_SCALE, fitScale, unbreakablePieces } from '../../src/games/food-chain-builder/logic/fit.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

test('a name is broken only between words and after a hyphen, so those are the pieces that must fit', () => {
  assert.deepEqual(unbreakablePieces('Mudskipper'), ['Mudskipper']);
  assert.deepEqual(unbreakablePieces('Fig tree'), ['Fig', 'tree']);
  assert.deepEqual(unbreakablePieces('Lion-tailed macaque'), ['Lion-', 'tailed', 'macaque']);
  assert.deepEqual(unbreakablePieces('  Giant   squirrel '), ['Giant', 'squirrel'], 'extra spaces make no empty pieces');
  assert.deepEqual(unbreakablePieces(''), []);
  assert.deepEqual(unbreakablePieces('   '), []);
});

test('a name that fits is left alone, even when it fits exactly', () => {
  assert.equal(fitScale(60, 94), 1);
  assert.equal(fitScale(94, 94), 1);
  assert.equal(fitScale(0, 94), 1);
});

test('a name that is too wide is shrunk to a little under the room it has, so a pixel of difference cannot break it', () => {
  const scale = fitScale(113.3, 94);
  assert.ok(scale < 94 / 113.3, 'smaller than the exact fit');
  assert.ok(scale > 0.78 && scale < 0.82, `about 0.8, got ${scale}`);
  // Drawn at that scale the widest piece is narrower than the room.
  assert.ok(113.3 * scale < 94);
});

test('a name is never shrunk below the smallest size that can be read: it is let break instead', () => {
  assert.equal(LEAST_SCALE, 0.7);
  assert.equal(fitScale(300, 94), LEAST_SCALE);
  assert.equal(fitScale(300, 94, 0.5), 0.5, 'the least can be given');
});

test('a measure that makes no sense is an error with the numbers in it, not a silent 1', () => {
  for (const [widest, room] of [[NaN, 94], [Infinity, 94], [-1, 94], [60, 0], [60, -5], [60, NaN], [-Infinity, 94]]) {
    throwsCode(() => fitScale(widest, room), 'BAD_MEASURE');
  }
  assert.throws(() => fitScale(-1, 94), (e) => e.context.widest === -1 && e.context.room === 94 && /-1px word/.test(e.message));
});
