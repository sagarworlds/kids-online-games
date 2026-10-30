import { test } from 'node:test';
import assert from 'node:assert/strict';

import { equals, compare, simplify, fromSlices, slicesFor, gcd, format } from '../../src/games/pizza-fractions/logic/fraction.js';
import { emptyPizza, toggleSlice, isEmpty, countTopping, sliceAtPoint } from '../../src/games/pizza-fractions/logic/pizza.js';
import { generateOrder, generateRound } from '../../src/games/pizza-fractions/logic/orderGenerator.js';
import { checkOrder, hintFor, offSlices } from '../../src/games/pizza-fractions/logic/orderChecker.js';
import { newAttempt, serve } from '../../src/games/pizza-fractions/logic/counter.js';
import { makeBonus } from '../../src/games/pizza-fractions/logic/bonus.js';
import { coinsFor, roundStars } from '../../src/games/pizza-fractions/logic/scoring.js';
import { LEVELS, LEVEL_IDS, getLevel, MAX_RETRIES } from '../../src/games/pizza-fractions/logic/levels.js';
import { TOPPINGS } from '../../src/games/pizza-fractions/logic/toppings.js';
import { createRng } from '../../src/engine/utils/random.js';

const f = (num, den) => ({ num, den });
const label = (id) => TOPPINGS.find((t) => t.id === id).label;
/** A pizza with `topping` on the first `count` slices. */
const topped = (slices, topping, count) => emptyPizza(slices).map((_, i) => (i < count ? topping : null));

// ---- fraction ----------------------------------------------------------------

test('equals handles equivalent fractions by cross-multiplication', () => {
  assert.ok(equals(f(2, 4), f(1, 2)));
  assert.ok(equals(f(4, 8), f(1, 2)));
  assert.ok(equals(f(2, 6), f(1, 3)));
  assert.ok(equals(f(0, 5), f(0, 9)));
  assert.ok(!equals(f(1, 3), f(1, 2)));
  assert.ok(!equals(f(3, 8), f(2, 8)));
});

test('equals is exact where floats are not (large denominators that differ by one)', () => {
  assert.ok(!equals(f(1, 1000000), f(1, 1000001)));
  assert.ok(equals(f(333333, 999999), f(1, 3)));
});

test('compare orders fractions and reports ties', () => {
  assert.equal(compare(f(1, 3), f(1, 2)), -1);
  assert.equal(compare(f(3, 4), f(2, 3)), 1);
  assert.equal(compare(f(2, 4), f(1, 2)), 0);
});

test('simplify reduces to lowest terms and leaves reduced fractions alone', () => {
  assert.deepEqual(simplify(f(2, 4)), f(1, 2));
  assert.deepEqual(simplify(f(6, 8)), f(3, 4));
  assert.deepEqual(simplify(f(3, 8)), f(3, 8));
  assert.deepEqual(simplify(f(0, 6)), f(0, 1));
  assert.equal(gcd(12, 18), 6);
});

test('fromSlices builds the fraction of a pizza and format prints it', () => {
  assert.deepEqual(fromSlices(3, 8), f(3, 8));
  assert.equal(format(f(3, 8)), '3/8');
});

test('invalid fractions are rejected with a clear error instead of NaN', () => {
  for (const bad of [f(1, 0), f(-1, 2), f(1.5, 2), f(1, -2)]) {
    assert.throws(() => equals(bad, f(1, 2)), { code: 'BAD_FRACTION' });
  }
  assert.throws(() => fromSlices(1, 0), { code: 'BAD_FRACTION' });
});

test('slicesFor says how many slices a fraction needs, or null when it does not fit', () => {
  assert.equal(slicesFor(f(1, 2), 8), 4);
  assert.equal(slicesFor(f(1, 3), 6), 2);
  assert.equal(slicesFor(f(3, 4), 12), 9);
  assert.equal(slicesFor(f(1, 3), 8), null);
  assert.equal(slicesFor(f(1, 4), 6), null);
});

// ---- pizza -------------------------------------------------------------------

test('toggleSlice puts a topping on, takes it off, and swaps toppings (one per slice)', () => {
  const start = emptyPizza(4);
  const a = toggleSlice(start, 1, 'olive');
  assert.deepEqual(a, [null, 'olive', null, null]);
  assert.deepEqual(toggleSlice(a, 1, 'olive'), start, 'tapping again removes it');
  assert.deepEqual(toggleSlice(a, 1, 'pepperoni'), [null, 'pepperoni', null, null], 'a different topping replaces it');
  assert.deepEqual(start, [null, null, null, null], 'the input is never changed');
});

test('toggleSlice rejects a slice that does not exist', () => {
  assert.throws(() => toggleSlice(emptyPizza(4), 4, 'olive'), { code: 'NO_SUCH_SLICE' });
  assert.throws(() => toggleSlice(emptyPizza(4), -1, 'olive'), { code: 'NO_SUCH_SLICE' });
  assert.throws(() => toggleSlice(emptyPizza(4), 1.5, 'olive'), { code: 'NO_SUCH_SLICE' });
});

test('isEmpty and countTopping', () => {
  assert.ok(isEmpty(emptyPizza(8)));
  const p = toggleSlice(emptyPizza(8), 3, 'olive');
  assert.ok(!isEmpty(p));
  assert.equal(countTopping(p, 'olive'), 1);
  assert.equal(countTopping(p, 'cheese'), 0);
});

test('sliceAtPoint finds the slice by angle: slice 0 starts at 12 o\'clock and they run clockwise', () => {
  const c = { cx: 100, cy: 100, radius: 100 };
  assert.equal(sliceAtPoint(110, 20, c, 4), 0, 'just right of the top');
  assert.equal(sliceAtPoint(180, 110, c, 4), 1, 'right side');
  assert.equal(sliceAtPoint(90, 180, c, 4), 2, 'bottom');
  assert.equal(sliceAtPoint(20, 90, c, 4), 3, 'left side');
  assert.equal(sliceAtPoint(90, 20, c, 4), 3, 'just left of the top is the last slice');
});

test('a tap exactly on a border belongs to the slice that starts there (rounded down)', () => {
  const c = { cx: 100, cy: 100, radius: 100 };
  assert.equal(sliceAtPoint(100, 20, c, 4), 0, 'straight up: the border between slice 3 and 0');
  assert.equal(sliceAtPoint(180, 100, c, 4), 1, 'straight right: the border between slice 0 and 1');
  assert.equal(sliceAtPoint(100, 180, c, 4), 2);
  assert.equal(sliceAtPoint(20, 100, c, 4), 3);
});

test('sliceAtPoint returns null outside the pizza and the exact centre is slice 0', () => {
  const c = { cx: 100, cy: 100, radius: 100 };
  assert.equal(sliceAtPoint(250, 100, c, 8), null);
  assert.equal(sliceAtPoint(100, 100, c, 8), 0);
});

test('every slice centre maps back to its own slice for every slice count', () => {
  const c = { cx: 0, cy: 0, radius: 100 };
  for (const slices of [2, 4, 6, 8, 10, 12]) {
    for (let i = 0; i < slices; i++) {
      const angle = ((i + 0.5) * 2 * Math.PI) / slices;
      assert.equal(sliceAtPoint(60 * Math.sin(angle), -60 * Math.cos(angle), c, slices), i, `${slices} slices, slice ${i}`);
    }
  }
});

// ---- order generator -----------------------------------------------------------

test('levels match the spec table', () => {
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  assert.deepEqual(LEVELS.easy.slices, [2, 4, 8]);
  assert.deepEqual(LEVELS.medium.slices, [4, 6, 8, 12]);
  assert.deepEqual(LEVELS.hard.slices, [6, 8, 10, 12]);
  assert.throws(() => getLevel('impossible'), { code: 'UNKNOWN_LEVEL' });
});

test('every generated order is possible: whole slices, never the whole pizza, toppings never overlap', () => {
  for (const levelId of LEVEL_IDS) {
    const level = getLevel(levelId);
    const rng = createRng(1234);
    for (let i = 0; i < 400; i++) {
      const order = generateOrder(levelId, rng, i + 1);
      assert.ok(level.slices.includes(order.slices), `${levelId}: ${order.slices} slices is allowed`);
      assert.equal(order.lines.length, level.twoToppings ? 2 : 1);
      let used = 0;
      for (const line of order.lines) {
        const needed = slicesFor(line.amount, order.slices);
        assert.ok(needed !== null && needed >= 1, `${levelId}: ${format(line.amount)} on ${order.slices} slices is a whole number of slices`);
        assert.ok(line.amount.num < line.amount.den, 'less than a whole pizza');
        assert.ok(level.toppings.includes(line.topping));
        used += needed;
      }
      assert.ok(used <= order.slices, `${levelId}: ${used} slices fit on ${order.slices}`);
      assert.equal(new Set(order.lines.map((l) => l.topping)).size, order.lines.length, 'different toppings');
    }
  }
});

test('the impossible example from the spec, 1/3 on an 8-slice pizza, is never generated', () => {
  for (const levelId of LEVEL_IDS) {
    const rng = createRng(77);
    for (let i = 0; i < 500; i++) {
      const order = generateOrder(levelId, rng, i + 1);
      if (order.slices !== 8) continue;
      for (const line of order.lines) assert.notEqual(line.amount.den, 3);
    }
  }
});

test('Easy orders always use the same denominator as the cut', () => {
  const rng = createRng(5);
  for (let i = 0; i < 200; i++) {
    const order = generateOrder('easy', rng, i + 1);
    assert.equal(order.lines[0].amount.den, order.slices);
  }
});

test('Medium and Hard include equivalent fractions in lowest terms, and Easy never does', () => {
  for (const levelId of ['medium', 'hard']) {
    const rng = createRng(9);
    let equivalent = 0;
    // An equivalent order has a denominator different from the number of slices.
    const rng2 = createRng(9);
    for (let i = 0; i < 300; i++) {
      const order = generateOrder(levelId, rng2, i + 1);
      for (const line of order.lines) if (line.amount.den !== order.slices) {
        equivalent += 1;
        assert.deepEqual(simplify(line.amount), line.amount, 'equivalent orders are written in lowest terms');
        assert.equal(order.slices % line.amount.den, 0);
      }
    }
    assert.ok(equivalent > 100, `${levelId} makes plenty of equivalent orders (got ${equivalent})`);
  }
});

test('Hard orders have two toppings; Easy and Medium have one', () => {
  const rng = createRng(3);
  assert.equal(generateOrder('hard', rng).lines.length, 2);
  assert.equal(generateOrder('medium', rng).lines.length, 1);
  assert.equal(generateOrder('easy', rng).lines.length, 1);
});

test('generation is reproducible from a seed', () => {
  assert.deepEqual(generateRound('hard', 8, createRng(42)), generateRound('hard', 8, createRng(42)));
});

test('a round has the requested number of orders with distinct, increasing ids', () => {
  const round = generateRound('medium', 8, createRng(2));
  assert.equal(round.length, 8);
  assert.equal(new Set(round.map((o) => o.id)).size, 8);
  assert.throws(() => generateRound('easy', 0, createRng(1)), { code: 'BAD_COUNT' });
  assert.throws(() => generateOrder('nope', createRng(1)), { code: 'UNKNOWN_LEVEL' });
});

// ---- order checker -------------------------------------------------------------

const easyOrder = { id: 1, customer: 'Asha', slices: 8, lines: [{ topping: 'pepperoni', amount: f(3, 8) }] };

test('a pizza with exactly the ordered slices is correct', () => {
  const result = checkOrder(easyOrder, topped(8, 'pepperoni', 3));
  assert.ok(result.ok);
  assert.deepEqual(result.perLine[0].expected, f(3, 8));
  assert.deepEqual(result.perLine[0].actual, f(3, 8));
});

test('which slices carry the topping does not matter, only how many', () => {
  const pizza = toggleSlice(toggleSlice(toggleSlice(emptyPizza(8), 1, 'pepperoni'), 4, 'pepperoni'), 7, 'pepperoni');
  assert.ok(checkOrder(easyOrder, pizza).ok);
});

test('too few or too many slices is wrong and reports what the child has', () => {
  for (const count of [1, 2, 4, 8]) {
    const result = checkOrder(easyOrder, topped(8, 'pepperoni', count));
    assert.ok(!result.ok, `${count} slices`);
    assert.deepEqual(result.perLine[0].actual, f(count, 8));
  }
});

test('an equivalent order is satisfied by the matching slice count: 1/2 olive on 8 slices needs 4', () => {
  const order = { id: 2, customer: 'Ravi', slices: 8, lines: [{ topping: 'olive', amount: f(1, 2) }] };
  assert.ok(checkOrder(order, topped(8, 'olive', 4)).ok);
  assert.ok(!checkOrder(order, topped(8, 'olive', 2)).ok);
  assert.equal(checkOrder(order, topped(8, 'olive', 3)).perLine[0].needed, 4);
});

test('the wrong topping is wrong even with the right number of slices', () => {
  const result = checkOrder(easyOrder, topped(8, 'olive', 3));
  assert.ok(!result.ok);
  assert.deepEqual(result.extras, ['olive']);
});

test('a topping nobody ordered spoils an otherwise correct pizza', () => {
  const pizza = toggleSlice(topped(8, 'pepperoni', 3), 7, 'mushroom');
  const result = checkOrder(easyOrder, pizza);
  assert.ok(result.perLine[0].ok);
  assert.ok(!result.ok);
  assert.deepEqual(result.extras, ['mushroom']);
});

test('multi-topping orders need every line right', () => {
  const order = { id: 3, customer: 'Mina', slices: 12, lines: [{ topping: 'mushroom', amount: f(1, 4) }, { topping: 'cheese', amount: f(1, 2) }] };
  const pizza = emptyPizza(12).map((_, i) => (i < 3 ? 'mushroom' : i < 9 ? 'cheese' : null));
  assert.ok(checkOrder(order, pizza).ok);
  assert.ok(!checkOrder(order, emptyPizza(12).map((_, i) => (i < 3 ? 'mushroom' : i < 8 ? 'cheese' : null))).ok);
  assert.ok(!checkOrder(order, topped(12, 'mushroom', 3)).ok, 'cheese missing');
});

test('hints say what you have against what was ordered', () => {
  const hint = hintFor(checkOrder(easyOrder, topped(8, 'pepperoni', 2)), label);
  assert.equal(hint, 'You have 2/8 pepperoni, the order is 3/8.');
});

test('hints for an equivalent order explain the slice count', () => {
  const order = { id: 2, customer: 'Ravi', slices: 8, lines: [{ topping: 'olive', amount: f(1, 2) }] };
  assert.equal(hintFor(checkOrder(order, topped(8, 'olive', 3)), label), 'You have 3/8 olive, the order is 1/2. That is 4 of 8 slices.');
});

test('hints name a topping nobody asked for', () => {
  const pizza = toggleSlice(topped(8, 'pepperoni', 3), 7, 'mushroom');
  assert.match(hintFor(checkOrder(easyOrder, pizza), label), /Nobody asked for mushroom/);
});

test('offSlices points at surplus slices when there are too many, and bare slices when too few', () => {
  assert.deepEqual(offSlices(easyOrder, topped(8, 'pepperoni', 5)), [3, 4], 'two too many: the last two topped slices');
  assert.deepEqual(offSlices(easyOrder, topped(8, 'pepperoni', 1)), [1, 2, 3, 4, 5, 6, 7], 'too few: the bare slices');
  assert.deepEqual(offSlices(easyOrder, topped(8, 'pepperoni', 3)), [], 'nothing to flag when right');
});

test('offSlices flags slices carrying a topping nobody ordered', () => {
  const pizza = emptyPizza(8).map((_, i) => (i < 3 ? 'pepperoni' : i === 6 ? 'mushroom' : null));
  assert.deepEqual(offSlices(easyOrder, pizza), [6]);
});

// ---- serving ------------------------------------------------------------------

test('serving an empty pizza is blocked and does not use up a try', () => {
  const a = newAttempt(easyOrder);
  const out = serve(a, emptyPizza(8));
  assert.equal(out.kind, 'empty');
  assert.equal(out.attempt.wrong, 0);
});

test('right first time scores as first, with 10 coins', () => {
  const out = serve(newAttempt(easyOrder), topped(8, 'pepperoni', 3));
  assert.equal(out.kind, 'correct');
  assert.equal(out.status, 'first');
  assert.equal(coinsFor(out.status), 10);
});

test('right after a wrong serve scores as retry, with 5 coins', () => {
  const wrong = serve(newAttempt(easyOrder), topped(8, 'pepperoni', 2));
  assert.equal(wrong.kind, 'wrong');
  assert.equal(wrong.retriesLeft, MAX_RETRIES);
  const right = serve(wrong.attempt, topped(8, 'pepperoni', 3));
  assert.equal(right.status, 'retry');
  assert.equal(coinsFor(right.status), 5);
});

test('after the allowed retries are used up the customer leaves unhappy and the order scores nothing', () => {
  let attempt = newAttempt(easyOrder);
  const outcomes = [];
  for (let i = 0; i < MAX_RETRIES + 1; i++) {
    const out = serve(attempt, topped(8, 'pepperoni', 1));
    outcomes.push(out);
    attempt = out.attempt;
  }
  assert.deepEqual(outcomes.map((o) => o.kind), ['wrong', 'wrong', 'failed']);
  assert.deepEqual(outcomes.map((o) => o.retriesLeft), [2, 1, undefined]);
  assert.equal(outcomes.at(-1).status, 'failed');
  assert.equal(coinsFor('failed'), 0);
});

test('serve never changes the attempt it was given', () => {
  const a = newAttempt(easyOrder);
  serve(a, topped(8, 'pepperoni', 1));
  assert.equal(a.wrong, 0);
});

// ---- bonus question ------------------------------------------------------------

test('bonus questions compare two fractions that are really different, and the answer is right', () => {
  const rng = createRng(11);
  let leftAnswers = 0;
  for (let i = 0; i < 500; i++) {
    const q = makeBonus(rng);
    assert.notEqual(compare(q.a, q.b), 0, `${format(q.a)} vs ${format(q.b)}`);
    const bigger = compare(q.a, q.b) > 0 ? 'a' : 'b';
    assert.equal(q.answer, bigger);
    if (q.answer === 'a') leftAnswers += 1;
  }
  assert.ok(leftAnswers > 150 && leftAnswers < 350, `the answer is on both sides (left ${leftAnswers}/500)`);
});

// ---- scoring ------------------------------------------------------------------

test('round stars: all first-try is 3; a mix of retries is 2; mostly failures is 1', () => {
  assert.equal(roundStars(Array(8).fill('first')), 3);
  assert.equal(roundStars(['first', 'first', 'first', 'first', 'first', 'first', 'first', 'retry']), 3, '7.5/8 = 94%');
  assert.equal(roundStars(['first', 'first', 'first', 'first', 'first', 'retry', 'retry', 'retry']), 2, '6.5/8 = 81%');
  assert.equal(roundStars(['failed', 'failed', 'failed', 'failed', 'first', 'failed', 'failed', 'failed']), 1);
  assert.equal(roundStars([]), 1);
});

test('coin values match the spec', () => {
  assert.deepEqual(['first', 'retry', 'failed'].map(coinsFor), [10, 5, 0]);
});
