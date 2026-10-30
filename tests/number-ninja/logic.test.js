import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS, LEVEL_IDS, getLevel, OP_SYMBOL } from '../../src/games/number-ninja/logic/levels.js';
import { generateProblem, problemKey } from '../../src/games/number-ninja/logic/problemGenerator.js';
import { scoreAnswer, accuracyOf, starsFor, MAX_POINTS } from '../../src/games/number-ninja/logic/scoring.js';
import { findTarget, findLowest } from '../../src/games/number-ninja/logic/answerMatcher.js';
import { appendDigit, backspace, parseAnswer, MAX_DIGITS } from '../../src/games/number-ninja/logic/answerInput.js';
import { hintFor, problemToSpeech, problemToText } from '../../src/games/number-ninja/logic/hints.js';
import { createRng } from '../../src/engine/utils/random.js';

const SAMPLES = 1000;

// ---- levels ----------------------------------------------------------------

test('level table matches the spec (operations, fall times, max on screen)', () => {
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  assert.deepEqual(LEVELS.easy.ops, ['+', '-']);
  assert.deepEqual(LEVELS.medium.ops, ['+', '-', 'x']);
  assert.deepEqual(LEVELS.hard.ops, ['+', '-', 'x', '/']);
  assert.deepEqual([LEVELS.easy.fallTime, LEVELS.medium.fallTime, LEVELS.hard.fallTime],
    [{ start: 12, min: 9 }, { start: 10, min: 7 }, { start: 8, min: 5 }]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].maxOnScreen), [2, 3, 3]);
  assert.deepEqual([LEVELS.easy.addSub.max, LEVELS.medium.addSub.max, LEVELS.hard.addSub.max], [20, 100, 500]);
  assert.deepEqual(LEVELS.medium.tables, { min: 2, max: 5 });
  assert.deepEqual(LEVELS.hard.tables, { min: 2, max: 12 });
});

test('getLevel rejects unknown levels with a GameError', () => {
  assert.throws(() => getLevel('impossible'), { code: 'UNKNOWN_LEVEL' });
});

// ---- generator: 1,000 samples per level and per operation ------------------

/** Asserts a problem obeys the level's number ranges and that its answer is right. */
function assertValid(level, p) {
  const { addSub, tables, factorMax } = level;
  const where = `${level.id}: ${problemKey(p)}`;
  assert.ok(Number.isInteger(p.a) && Number.isInteger(p.b) && Number.isInteger(p.answer), `whole numbers (${where})`);
  assert.ok(p.a >= 0 && p.b >= 0 && p.answer >= 0, `never negative (${where})`);
  assert.ok(level.ops.includes(p.op), `operation allowed on level (${where})`);

  switch (p.op) {
    case '+':
      assert.equal(p.answer, p.a + p.b, where);
      assert.ok(p.a >= addSub.min && p.b >= addSub.min, where);
      assert.ok(p.a <= addSub.max && p.b <= addSub.max && p.answer <= addSub.max, `sum within ${addSub.max} (${where})`);
      break;
    case '-':
      assert.equal(p.answer, p.a - p.b, where);
      assert.ok(p.a <= addSub.max && p.b >= addSub.min && p.b <= p.a, where);
      break;
    case 'x': {
      assert.equal(p.answer, p.a * p.b, where);
      const inTable = (t, f) => t >= tables.min && t <= tables.max && f >= 2 && f <= factorMax;
      assert.ok(inTable(p.a, p.b) || inTable(p.b, p.a), `one factor from the table, the other 2..${factorMax} (${where})`);
      break;
    }
    case '/': {
      assert.equal(p.a % p.b, 0, `exact division (${where})`);
      assert.equal(p.answer, p.a / p.b, where);
      assert.ok(p.b >= tables.min && p.b <= tables.max, `divisor from the table (${where})`);
      assert.ok(p.answer >= 2 && p.answer <= factorMax, where);
      break;
    }
    default:
      assert.fail(`unexpected op ${p.op}`);
  }
}

for (const id of LEVEL_IDS) {
  const level = LEVELS[id];
  const selections = [...level.ops.map((op) => [op]), level.ops];
  for (const ops of selections) {
    test(`${id} [${ops.join(' ')}]: ${SAMPLES} samples match the level's ranges`, () => {
      const rng = createRng(2024);
      const seen = new Set();
      for (let i = 0; i < SAMPLES; i++) {
        const p = generateProblem(id, ops, rng);
        assertValid(level, p);
        assert.ok(ops.includes(p.op), `only chosen operations are used (${p.op})`);
        seen.add(p.op);
      }
      assert.deepEqual([...seen].sort(), [...ops].sort(), 'every chosen operation actually appears');
    });
  }
}

test('easy never produces a negative answer or a number above 20', () => {
  const rng = createRng(1);
  for (let i = 0; i < SAMPLES; i++) {
    const p = generateProblem('easy', ['+', '-'], rng);
    assert.ok(p.answer >= 0 && p.answer <= 20 && p.a <= 20 && p.b <= 20, problemKey(p));
  }
});

test('operations not offered on a level are ignored, and an empty choice fails loudly', () => {
  const rng = createRng(3);
  for (let i = 0; i < 100; i++) assert.equal(generateProblem('easy', ['+', 'x', '/'], rng).op, '+');
  assert.throws(() => generateProblem('easy', ['x'], rng), { code: 'NO_OPERATIONS' });
  assert.throws(() => generateProblem('easy', [], rng), { code: 'NO_OPERATIONS' });
  assert.throws(() => generateProblem('nope', ['+'], rng), { code: 'UNKNOWN_LEVEL' });
});

test('the same problem does not repeat within 5 spawns', () => {
  for (const [level, ops] of [['easy', ['+', '-']], ['medium', ['x']], ['hard', ['/']]]) {
    const rng = createRng(77);
    const recent = [];
    for (let i = 0; i < 500; i++) {
      const key = problemKey(generateProblem(level, ops, rng, recent));
      assert.ok(!recent.includes(key), `${level}: ${key} repeated within 5 spawns`);
      recent.push(key);
      if (recent.length > 5) recent.shift();
    }
  }
});

test('the generator is deterministic for a seed', () => {
  const run = (seed) => { const rng = createRng(seed); return Array.from({ length: 30 }, () => problemKey(generateProblem('hard', LEVELS.hard.ops, rng))); };
  assert.deepEqual(run(5), run(5));
  assert.notDeepEqual(run(5), run(6));
});

test('a tiny problem space still returns a problem instead of hanging', () => {
  // Every key is "recent": the generator must give up avoiding repeats rather than loop forever.
  const everything = new Proxy([], { get: (t, k) => (k === 'includes' ? () => true : t[k]) });
  assert.ok(generateProblem('easy', ['+'], createRng(1), everything));
});

// ---- scoring ---------------------------------------------------------------

test('scoreAnswer is 10 + 2 x streak, capped at 30', () => {
  assert.deepEqual([0, 1, 2, 3, 9, 10, 11, 50].map(scoreAnswer), [10, 12, 14, 16, 28, 30, 30, 30]);
  assert.equal(MAX_POINTS, 30);
  for (const bad of [-1, 1.5, NaN, '3', undefined]) assert.throws(() => scoreAnswer(bad), { code: 'BAD_STREAK' });
});

test('accuracy counts wrong answers and landed stars as attempts', () => {
  assert.equal(accuracyOf({ correct: 0, wrong: 0, missed: 0 }), 0);
  assert.equal(accuracyOf({ correct: 18, wrong: 1, missed: 1 }), 0.9);
  assert.equal(accuracyOf({ correct: 5, wrong: 5, missed: 0 }), 0.5);
});

test('starsFor: 90% = 3, 70% = 2, otherwise 1 (never 0)', () => {
  assert.deepEqual([1, 0.9, 0.89, 0.7, 0.69, 0].map(starsFor), [3, 3, 2, 2, 1, 1]);
});

// ---- answer matching -------------------------------------------------------

test('findTarget returns the lowest star with the typed answer', () => {
  const stars = [
    { id: 1, answer: 12, y: 0.2 },
    { id: 2, answer: 12, y: 0.7 },
    { id: 3, answer: 9, y: 0.9 },
  ];
  assert.equal(findTarget(stars, 12).id, 2, 'two stars with the same answer: the lower one is cleared');
  assert.equal(findTarget(stars, 9).id, 3);
  assert.equal(findTarget(stars, 99), null);
  assert.equal(findTarget([], 1), null);
  assert.equal(findTarget(stars, 0), null, '0 does not match a missing answer');
  assert.equal(findLowest(stars).id, 3);
  assert.equal(findLowest([]), null);
});

test('findTarget matches an answer of 0', () => {
  assert.equal(findTarget([{ id: 1, answer: 0, y: 0.1 }], 0).id, 1);
});

// ---- typed answer buffer ---------------------------------------------------

test('appendDigit ignores non-digits, leading zeros and anything past 4 digits', () => {
  let b = '';
  for (const key of ['a', ' ', '-', '.', 'Enter']) b = appendDigit(b, key);
  assert.equal(b, '');
  b = appendDigit(b, '0');
  assert.equal(b, '0', 'a lone zero is a valid answer');
  b = appendDigit(b, '0');
  assert.equal(b, '0', 'extra leading zeros are ignored');
  b = appendDigit(b, '7');
  assert.equal(b, '7', '"0" then "7" is 7, not 07');
  for (const d of '12345') b = appendDigit(b, d);
  assert.equal(b, '7123');
  assert.equal(b.length, MAX_DIGITS);
});

test('backspace and parseAnswer', () => {
  assert.equal(backspace('123'), '12');
  assert.equal(backspace(''), '');
  assert.equal(parseAnswer(''), null, 'empty input is ignored');
  assert.equal(parseAnswer('0'), 0);
  assert.equal(parseAnswer('0042'), 42);
});

// ---- hints -----------------------------------------------------------------

test('hints teach a method per operation without revealing the answer', () => {
  const cases = [
    [{ a: 7, b: 5, op: '+', answer: 12 }, 'count up'],
    [{ a: 9, b: 4, op: '-', answer: 5 }, 'count back'],
    [{ a: 6, b: 7, op: 'x', answer: 42 }, 'groups'],
    [{ a: 56, b: 8, op: '/', answer: 7 }, 'fit into'],
  ];
  for (const [p, phrase] of cases) {
    const hint = hintFor(p);
    assert.ok(hint.includes(phrase), hint);
    assert.ok(!new RegExp(`\\b${p.answer}\\b`).test(hint), `hint must not state the answer: ${hint}`);
  }
});

test('problem text and speech use friendly symbols and words', () => {
  assert.equal(problemToText({ a: 7, b: 8, op: 'x' }), '7 × 8');
  assert.equal(problemToText({ a: 9, b: 3, op: '/' }), '9 ÷ 3');
  assert.equal(problemToText({ a: 9, b: 3, op: '-' }), '9 − 3');
  assert.equal(problemToSpeech({ a: 7, b: 8, op: 'x' }), '7 times 8');
  assert.equal(problemToSpeech({ a: 9, b: 3, op: '/' }), '9 divided by 3');
  assert.deepEqual(Object.keys(OP_SYMBOL), ['+', '-', 'x', '/']);
});
