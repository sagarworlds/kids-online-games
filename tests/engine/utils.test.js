import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameError, invalidData } from '../../src/engine/utils/errors.js';
import { createRng, randInt, pick, shuffle, sample } from '../../src/engine/utils/random.js';
import { clamp, lerp, distance, pointInRect, pointInCircle, rectsOverlap, circlesOverlap } from '../../src/engine/utils/geometry.js';
import { Countdown, sleep } from '../../src/engine/utils/timer.js';
import { starsForAccuracy, praiseFor } from '../../src/engine/utils/stars.js';
import { createParentQuestion, checkParentAnswer } from '../../src/engine/utils/parentCheck.js';

test('GameError carries code and context', () => {
  const err = new GameError('INVALID_NAME', 'bad', { reason: 'length' });
  assert.equal(err.code, 'INVALID_NAME');
  assert.deepEqual(err.context, { reason: 'length' });
  assert.ok(err instanceof Error);
});

test('invalidData throws an INVALID_DATA GameError naming file and field', () => {
  assert.throws(
    () => invalidData('levels.json', 'levels[2].goal', 'is missing'),
    (e) => e.code === 'INVALID_DATA' && e.context.file === 'levels.json' && e.context.field === 'levels[2].goal',
  );
});

test('createRng is deterministic per seed and stays in [0, 1)', () => {
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const seqA = Array.from({ length: 50 }, a);
  assert.deepEqual(seqA, Array.from({ length: 50 }, b));
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, c));
  assert.ok(seqA.every((n) => n >= 0 && n < 1));
});

test('randInt covers both inclusive bounds and rejects reversed ranges', () => {
  const rng = createRng(1);
  const seen = new Set(Array.from({ length: 500 }, () => randInt(rng, 3, 6)));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
  assert.throws(() => randInt(rng, 5, 4), { code: 'BAD_RANGE' });
});

test('shuffle returns a permutation and does not mutate its input', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(createRng(7), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...out].sort((x, y) => x - y), input);
});

test('pick and sample validate their inputs', () => {
  const rng = createRng(9);
  assert.throws(() => pick(rng, []), { code: 'EMPTY_LIST' });
  assert.throws(() => sample(rng, [1, 2], 3), { code: 'BAD_SAMPLE' });
  const got = sample(rng, [1, 2, 3, 4, 5], 3);
  assert.equal(new Set(got).size, 3);
});

test('geometry helpers', () => {
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.ok(pointInRect({ x: 5, y: 5 }, { x: 0, y: 0, w: 10, h: 10 }));
  assert.ok(!pointInRect({ x: 11, y: 5 }, { x: 0, y: 0, w: 10, h: 10 }));
  assert.ok(pointInCircle({ x: 3, y: 4 }, { x: 0, y: 0, r: 5 }));
  assert.ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }), 'touching edges do not overlap');
  assert.ok(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 }));
  assert.ok(circlesOverlap({ x: 0, y: 0, r: 5 }, { x: 8, y: 0, r: 5 }));
  assert.ok(!circlesOverlap({ x: 0, y: 0, r: 5 }, { x: 10, y: 0, r: 5 }));
});

test('Countdown only advances with dt and reports the tick it finishes on', () => {
  const c = new Countdown(1);
  assert.equal(c.tick(0.4), false);
  assert.equal(c.tick(0.4), false);
  assert.equal(c.tick(0.4), true);
  assert.equal(c.remaining, 0);
  assert.equal(c.tick(1), false, 'already done');
  c.reset();
  assert.equal(c.remaining, 1);
});

test('sleep resolves, and rejects with ABORTED when cancelled', async () => {
  await sleep(1);
  const controller = new AbortController();
  const pending = sleep(1000, controller.signal);
  controller.abort();
  await assert.rejects(pending, { code: 'ABORTED' });
  await assert.rejects(sleep(1, controller.signal), { code: 'ABORTED' });
});

test('starsForAccuracy follows the default 90 / 70 rule', () => {
  assert.equal(starsForAccuracy(1), 3);
  assert.equal(starsForAccuracy(0.9), 3);
  assert.equal(starsForAccuracy(0.8999), 2);
  assert.equal(starsForAccuracy(0.7), 2);
  assert.equal(starsForAccuracy(0.69), 1);
  assert.equal(starsForAccuracy(0), 1, 'a finished round always earns a star');
});

test('praiseFor returns a non-empty line for every star count', () => {
  for (const stars of [1, 2, 3]) assert.ok(praiseFor(stars, createRng(stars)).length > 0);
});

test('parent check asks a 6-9 times question and checks the integer answer', () => {
  const rng = createRng(5);
  for (let i = 0; i < 100; i++) {
    const q = createParentQuestion(rng);
    const [a, b] = q.text.split(' × ').map(Number);
    assert.ok(a >= 6 && a <= 9 && b >= 6 && b <= 9);
    assert.equal(q.answer, a * b);
    assert.ok(checkParentAnswer(q, String(q.answer)));
    assert.ok(checkParentAnswer(q, ` ${q.answer} `), 'whitespace is trimmed');
    assert.ok(!checkParentAnswer(q, String(q.answer + 1)));
  }
  const q = { text: '7 × 8', answer: 56 };
  assert.ok(!checkParentAnswer(q, ''));
  assert.ok(!checkParentAnswer(q, '56.0'));
  assert.ok(!checkParentAnswer(q, 'fifty-six'));
});
