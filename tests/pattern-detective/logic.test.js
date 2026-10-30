import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEVELS, LEVEL_IDS, getLevel, MAX_NUMBER, CASES_PER_ROUND } from '../../src/games/pattern-detective/logic/levels.js';
import { same, indexOfItem, allDistinct } from '../../src/games/pattern-detective/logic/equality.js';
import { COLORS, COLOR_IDS, SHAPES, numberOptions, tokenOptions, describeToken, missingIndexFor } from '../../src/games/pattern-detective/logic/generators/helpers.js';
import { GENERATORS, generatorsFor, generatePuzzle, generateRound } from '../../src/games/pattern-detective/logic/generatorRegistry.js';
import { roundStars, rankFor, roundScore, RANKS } from '../../src/games/pattern-detective/logic/scoring.js';
import { createRng } from '../../src/engine/utils/random.js';

const SEEDS = 300;
const isToken = (x) => typeof x === 'object' && x !== null;
const byId = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));

/** Every generator at every level it allows, many seeds. */
function* allPuzzles(seeds = SEEDS) {
  for (const g of GENERATORS) {
    for (const levelId of g.levels) {
      for (let seed = 1; seed <= seeds; seed++) yield { g, levelId, seed, puzzle: g.generate(createRng(seed * 31 + levelId.length), levelId) };
    }
  }
}

// ---- equality ----------------------------------------------------------------------------

test('numbers compare by value and tokens by shape, colour, rotation and count', () => {
  assert.ok(same(5, 5));
  assert.ok(!same(5, 6));
  assert.ok(!same(5, { shape: 'star', color: 'red' }));
  assert.ok(same({ shape: 'star', color: 'red' }, { shape: 'star', color: 'red', count: 1, rotation: 0 }), 'defaults');
  assert.ok(!same({ shape: 'star', color: 'red' }, { shape: 'star', color: 'blue' }));
  assert.ok(!same({ shape: 'star', color: 'red' }, { shape: 'circle', color: 'red' }));
  assert.ok(!same({ shape: 'star', color: 'red', count: 2 }, { shape: 'star', color: 'red', count: 3 }));
  assert.ok(!same({ shape: 'arrow', color: 'red', rotation: 90 }, { shape: 'arrow', color: 'red', rotation: 180 }));
  assert.equal(indexOfItem([1, 2, 3], 3), 2);
  assert.equal(indexOfItem([1, 2], 9), -1);
  assert.ok(allDistinct([1, 2, 3]));
  assert.ok(!allDistinct([1, 2, 1]));
  assert.ok(allDistinct([{ shape: 'star', color: 'red' }, { shape: 'star', color: 'blue' }]));
});

// ---- option builders -----------------------------------------------------------------------

test('number options are four different whole numbers from 0 to 200 including the answer, even at the edges', () => {
  const rng = createRng(1);
  for (const answer of [0, 1, 2, 5, 100, 198, 199, 200]) {
    for (let i = 0; i < 50; i++) {
      const options = numberOptions(answer, [[answer + 1, answer - 1], [answer + 5, answer - 5], [answer + 500, -3, 2.5, answer]], rng);
      assert.equal(options.length, 4);
      assert.equal(new Set(options).size, 4, `${answer}: ${options}`);
      assert.equal(options.filter((o) => o === answer).length, 1);
      assert.ok(options.every((o) => Number.isInteger(o) && o >= 0 && o <= MAX_NUMBER), `${answer}: ${options}`);
    }
  }
});

test('token options are four different tokens including the answer, filling gaps from the fallback', () => {
  const rng = createRng(2);
  const answer = { shape: 'star', color: 'red' };
  const fallback = () => ({ shape: SHAPES[Math.floor(rng() * SHAPES.length)], color: COLOR_IDS[Math.floor(rng() * COLOR_IDS.length)] });
  for (let i = 0; i < 100; i++) {
    const options = tokenOptions(answer, [[answer, { shape: 'star', color: 'red' }]], rng, fallback);
    assert.equal(options.length, 4);
    assert.ok(allDistinct(options));
    assert.equal(options.filter((o) => same(o, answer)).length, 1);
  }
  assert.throws(() => tokenOptions(answer, [], rng, () => answer), { code: 'NO_OPTIONS' });
  // one of each kind of mistake is always offered
  const groups = [[{ shape: 'circle', color: 'blue' }], [{ shape: 'square', color: 'green' }], [{ shape: 'triangle', color: 'sky' }]];
  for (let i = 0; i < 50; i++) {
    const options = tokenOptions(answer, groups, rng, fallback);
    for (const [g] of groups) assert.ok(indexOfItem(options, g) >= 0);
  }
});

test('the colour palette is the colour-blind-safe Okabe-Ito set', () => {
  assert.deepEqual(COLORS, { orange: '#E69F00', sky: '#56B4E9', green: '#009E73', yellow: '#F0E442', blue: '#0072B2', red: '#D55E00', purple: '#CC79A7' });
});

test('tokens are described in words for screen readers', () => {
  assert.equal(describeToken({ shape: 'circle', color: 'orange' }), 'orange circle');
  assert.equal(describeToken({ shape: 'star', color: 'sky', count: 3 }), '3 sky stars');
  assert.equal(describeToken({ shape: 'arrow', color: 'red', rotation: 90 }), 'red arrow pointing right');
  assert.equal(describeToken({ shape: 'arrow', color: 'red', rotation: 270 }), 'red arrow pointing left');
});

test('the missing item is the last on Easy and Medium and can be anywhere from a minimum on Hard', () => {
  const rng = createRng(3);
  assert.equal(missingIndexFor('easy', 6, rng), 5);
  assert.equal(missingIndexFor('medium', 5, rng), 4);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(missingIndexFor('hard', 6, rng, 2));
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

// ---- every generator: the shared rules ---------------------------------------------------

test('every puzzle has 5 or 6 items, the answer in its place, and four different options with the answer once', () => {
  let count = 0;
  for (const { g, levelId, seed, puzzle } of allPuzzles()) {
    count += 1;
    const label = `${g.id}/${levelId}/${seed}`;
    assert.equal(puzzle.type, g.id, label);
    assert.ok(puzzle.items.length >= 5 && puzzle.items.length <= 6, `${label}: ${puzzle.items.length} items`);
    assert.ok(Number.isInteger(puzzle.missingIndex) && puzzle.missingIndex >= 1 && puzzle.missingIndex < puzzle.items.length, label);
    assert.ok(same(puzzle.items[puzzle.missingIndex], puzzle.answer), `${label}: the answer is the hidden item`);
    assert.equal(puzzle.options.length, 4, label);
    assert.ok(allDistinct(puzzle.options), `${label}: options are different`);
    assert.equal(puzzle.options.filter((o) => same(o, puzzle.answer)).length, 1, `${label}: the answer appears once`);
    assert.ok(typeof puzzle.ruleText === 'string' && puzzle.ruleText.length > 8, label);
  }
  assert.ok(count >= 20 * SEEDS / 3);
});

test('the missing item is the last on Easy and Medium, and in the allowed range on Hard', () => {
  for (const { g, levelId, puzzle } of allPuzzles(100)) {
    if (levelId === 'hard') {
      assert.ok(puzzle.missingIndex >= 1, g.id);
    } else {
      assert.equal(puzzle.missingIndex, puzzle.items.length - 1, `${g.id}/${levelId}`);
    }
  }
  const hardPositions = new Set();
  for (const g of generatorsFor('hard')) for (let s = 1; s <= 200; s++) hardPositions.add(`${g.id}:${g.generate(createRng(s), 'hard').missingIndex}`);
  assert.ok([...hardPositions].some((p) => p.startsWith('missing-middle:1')) && [...hardPositions].some((p) => p.startsWith('missing-middle:3')), 'the middle of the sequence is used');
  assert.ok([...hardPositions].some((p) => !p.endsWith(':4') && !p.endsWith(':5')), 'Hard is not always at the end');
});

test('numbers stay between 0 and 200, in the items and in the options', () => {
  for (const { g, levelId, seed, puzzle } of allPuzzles()) {
    for (const x of [...puzzle.items, ...puzzle.options, puzzle.answer]) {
      if (typeof x === 'number') assert.ok(Number.isInteger(x) && x >= 0 && x <= MAX_NUMBER, `${g.id}/${levelId}/${seed}: ${x}`);
    }
  }
});

test('items and options are either all numbers or all tokens, and tokens use the safe palette and known shapes', () => {
  for (const { g, levelId, puzzle } of allPuzzles(100)) {
    const all = [...puzzle.items, ...puzzle.options];
    const numeric = all.every((x) => typeof x === 'number');
    const tokens = all.every(isToken);
    assert.ok(numeric || tokens, `${g.id}/${levelId}`);
    if (tokens) {
      for (const t of all) {
        assert.ok(COLOR_IDS.includes(t.color), `colour ${t.color}`);
        assert.ok([...SHAPES, 'arrow'].includes(t.shape), `shape ${t.shape}`);
        assert.ok(t.count === undefined || (Number.isInteger(t.count) && t.count >= 1 && t.count <= 10));
        assert.ok(t.rotation === undefined || [0, 90, 180, 270].includes(t.rotation));
      }
    }
  }
});

test('hints are well formed and never point at the hidden item', () => {
  for (const { g, levelId, puzzle } of allPuzzles(100)) {
    const { hint, items, missingIndex } = puzzle;
    const label = `${g.id}/${levelId}`;
    assert.ok(hint.kind && hint.text.length > 10, label);
    if (hint.highlight) assert.ok(hint.highlight.every((i) => Number.isInteger(i) && i >= 0 && i < items.length && i !== missingIndex), label);
    if (hint.labels) {
      assert.equal(hint.labels.length, items.length, label);
      assert.equal(hint.labels[missingIndex], null, `${label}: the hidden item has no label`);
    }
    if (hint.between) {
      assert.equal(hint.between.length, items.length - 1, label);
      assert.equal(hint.between[missingIndex - 1], null, label);
      if (missingIndex < items.length - 1) assert.equal(hint.between[missingIndex], null, label);
    }
  }
});

test('hints differ by pattern type', () => {
  const kinds = {};
  for (const g of GENERATORS) kinds[g.id] = g.generate(createRng(1), g.levels[0]).hint.kind;
  assert.deepEqual(kinds, {
    repeating: 'unit', growing: 'count', add: 'differences', subtract: 'differences', multiply: 'ratio',
    'two-attributes': 'attributes', alternating: 'alternating', 'missing-middle': 'gap', rotation: 'rotation',
  });
  assert.equal(new Set(Object.values(kinds)).size, 8, 'eight different kinds of hint for nine types');
  const texts = new Set(GENERATORS.map((g) => g.generate(createRng(1), g.levels[0]).hint.text));
  assert.equal(texts.size, GENERATORS.length, 'every type explains itself in its own words');
});

test('generating is reproducible from a seed', () => {
  for (const g of GENERATORS) {
    const level = g.levels[0];
    assert.deepEqual(g.generate(createRng(5), level), g.generate(createRng(5), level), g.id);
  }
});

// ---- each generator: the answer follows the rule --------------------------------------------

const puzzlesOf = (id, levelId, seeds = SEEDS) => Array.from({ length: seeds }, (_, i) => byId[id].generate(createRng(i + 1), levelId));
const diffs = (xs) => xs.slice(1).map((x, i) => x - xs[i]);

test('repeating: every item follows the repeating unit, and the unit is visible once before the gap', () => {
  for (const levelId of ['easy', 'medium', 'hard']) {
    const units = new Set();
    for (const p of puzzlesOf('repeating', levelId)) {
      const u = p.hint.highlight.length;
      units.add(u);
      p.items.forEach((item, i) => assert.ok(same(item, p.items[i % u]), `${levelId}: item ${i} follows the unit of ${u}`));
      assert.ok(p.missingIndex >= u, 'the whole unit is visible before the missing item');
      assert.deepEqual(p.hint.highlight, Array.from({ length: u }, (_, i) => i), 'the unit is the first u items');
      // Either the colour or the shape varies, not both.
      const shapes = new Set(p.items.map((t) => t.shape));
      const colors = new Set(p.items.map((t) => t.color));
      assert.ok(shapes.size === 1 || colors.size === 1, 'only one thing changes');
      assert.ok(Math.max(shapes.size, colors.size) >= 2);
    }
    if (levelId === 'easy') assert.deepEqual([...units].sort(), [2, 3], 'Easy: AB (2) and AAB (3)');
    if (levelId === 'medium') assert.ok(units.has(2) && units.has(3));
  }
});

test('repeating: the options include the wrong next item of the cycle and the right shape in the wrong colour', () => {
  let cycleSlip = 0;
  let colourSlip = 0;
  for (const p of puzzlesOf('repeating', 'medium')) {
    const others = p.items.filter((i) => !same(i, p.answer));
    if (p.options.some((o) => others.some((x) => same(x, o)))) cycleSlip += 1;
    if (p.options.some((o) => o.shape === p.answer.shape && o.color !== p.answer.color)) colourSlip += 1;
  }
  assert.equal(cycleSlip, SEEDS, 'a wrong next item from the cycle is always offered');
  assert.equal(colourSlip, SEEDS, 'the right shape in the wrong colour is always offered');
});

test('growing: each group has the same number more shapes, and the picture is the same shape and colour', () => {
  for (const levelId of ['easy', 'medium', 'hard']) {
    for (const p of puzzlesOf('growing', levelId)) {
      const counts = p.items.map((t) => t.count);
      const step = counts[1] - counts[0];
      assert.ok(step === 1 || step === 2);
      if (levelId === 'easy') assert.equal(step, 1);
      assert.ok(diffs(counts).every((d) => d === step));
      assert.ok(p.items.every((t) => t.shape === p.items[0].shape && t.color === p.items[0].color));
      assert.ok(p.options.every((t) => t.shape === p.items[0].shape && t.count >= 1));
      assert.deepEqual(p.hint.labels.filter(Boolean), counts.filter((_, i) => i !== p.missingIndex).map(String));
    }
  }
});

test('add and subtract: a constant step, going up or down, with the step shown in the rule', () => {
  for (const levelId of ['easy', 'medium', 'hard']) {
    for (const p of puzzlesOf('add', levelId)) {
      const d = diffs(p.items);
      assert.ok(d.every((x) => x === d[0] && x > 0), `${levelId}: ${p.items}`);
      assert.ok(p.ruleText.includes(`+${d[0]}`));
      if (levelId === 'easy') assert.ok([2, 3, 4, 5, 10].includes(d[0]));
    }
  }
  for (const levelId of ['medium', 'hard']) {
    for (const p of puzzlesOf('subtract', levelId)) {
      const d = diffs(p.items);
      assert.ok(d.every((x) => x === d[0] && x < 0), `${levelId}: ${p.items}`);
      assert.ok(p.ruleText.includes(`−${-d[0]}`));
      assert.ok(p.items.at(-1) >= 0);
    }
  }
  assert.deepEqual(byId.add.levels, ['easy', 'medium', 'hard']);
  assert.deepEqual(byId.subtract.levels, ['medium', 'hard']);
});

test('add: the wrong options include being a whole step out and one out', () => {
  let stepOut = 0;
  let oneOut = 0;
  for (const p of puzzlesOf('add', 'easy')) {
    const step = p.items[1] - p.items[0];
    if (p.options.some((o) => Math.abs(o - p.answer) === step)) stepOut += 1;
    if (p.options.some((o) => Math.abs(o - p.answer) === 1)) oneOut += 1;
  }
  assert.equal(stepOut, SEEDS, 'a whole step out is always offered');
  assert.equal(oneOut, SEEDS, 'one out is always offered');
});

test('multiply: doubles or triples each time, and adding the last jump is one of the wrong answers', () => {
  let addSlip = 0;
  const ratios = new Set();
  for (const levelId of ['medium', 'hard']) {
    for (const p of puzzlesOf('multiply', levelId)) {
      const ratio = p.items[1] / p.items[0];
      ratios.add(ratio);
      assert.ok(ratio === 2 || ratio === 3);
      p.items.forEach((x, i) => assert.equal(x, p.items[0] * ratio ** i));
      const before = p.items[p.missingIndex - 1];
      const lastJump = before - (p.items[p.missingIndex - 2] ?? 0);
      if (levelId === 'medium' && p.options.includes(before + lastJump) ) addSlip += 1;
    }
  }
  assert.deepEqual([...ratios].sort(), [2, 3]);
  assert.equal(addSlip, SEEDS, 'adding the last jump is always one of the wrong answers');
});

test('two attributes: shape and colour each follow their own cycle', () => {
  const periods = new Set();
  for (const levelId of ['medium', 'hard']) {
    for (const p of puzzlesOf('two-attributes', levelId)) {
      const findPeriod = (key) => [2, 3].find((n) => p.items.every((t, i) => i < n || t[key] === p.items[i - n][key]));
      const ps = findPeriod('shape');
      const pc = findPeriod('color');
      assert.ok(ps && pc, `${levelId}: both attributes cycle`);
      periods.add(`${levelId}:${ps}/${pc}`);
      if (levelId === 'medium') assert.deepEqual([ps, pc], [2, 2]);
      // the answer's shape and colour can each be worked out from items before the gap
      assert.equal(p.answer.shape, p.items[p.missingIndex - ps].shape);
      assert.equal(p.answer.color, p.items[p.missingIndex - pc].color);
      assert.ok(p.options.some((o) => o.shape === p.answer.shape && o.color !== p.answer.color), 'right shape, wrong colour offered');
      assert.ok(p.options.some((o) => o.shape !== p.answer.shape && o.color === p.answer.color), 'wrong shape, right colour offered');
    }
  }
  assert.ok(periods.has('hard:2/3') && periods.has('hard:3/2'), 'Hard mixes a 2-cycle with a 3-cycle');
});

test('alternating: the jumps take turns between two different sizes', () => {
  for (const p of puzzlesOf('alternating', 'hard')) {
    const d = diffs(p.items);
    assert.equal(p.items.length, 6);
    assert.ok(d.every((x, i) => x === d[i % 2]), `${p.items}`);
    assert.notEqual(d[0], d[1]);
    assert.ok(p.ruleText.includes(`+${d[0]}`) && p.ruleText.includes(`+${d[1]}`));
    assert.deepEqual(p.hint.between.filter(Boolean).sort(), d.filter((_, i) => i !== p.missingIndex - 1 && i !== p.missingIndex).map((x) => `+${x}`).sort());
  }
  assert.deepEqual(byId.alternating.levels, ['hard']);
});

test('missing middle: the gap has numbers on both sides and the step is constant', () => {
  const places = new Set();
  for (const p of puzzlesOf('missing-middle', 'hard')) {
    assert.equal(p.items.length, 5);
    assert.ok(p.missingIndex >= 1 && p.missingIndex <= 3, `gap at ${p.missingIndex}`);
    places.add(p.missingIndex);
    const d = diffs(p.items);
    assert.ok(d.every((x) => x === d[0] && x > 0));
  }
  assert.deepEqual([...places].sort(), [1, 2, 3]);
});

test('rotation: the arrow turns by the same amount each time, and the four choices are the four directions', () => {
  const turns = new Set();
  for (const p of puzzlesOf('rotation', 'hard')) {
    assert.ok(p.items.every((t) => t.shape === 'arrow' && t.color === p.items[0].color));
    const turn = (p.items[1].rotation - p.items[0].rotation + 360) % 360;
    turns.add(turn);
    p.items.forEach((t, i) => assert.equal(t.rotation, (p.items[0].rotation + turn * i) % 360));
    assert.deepEqual(p.options.map((o) => o.rotation).sort((a, b) => a - b), [0, 90, 180, 270]);
    assert.equal(p.options.filter((o) => o.rotation === p.answer.rotation).length, 1);
  }
  assert.deepEqual([...turns].sort((a, b) => a - b), [90, 180, 270]);
});

// ---- no ambiguity ------------------------------------------------------------------------------

/** Does a whole sequence follow one of the simple rule families: same jump, jumps that take turns, or same ratio? */
function followsSimpleRule(seq) {
  const d = seq.slice(1).map((x, i) => x - seq[i]);
  if (d.every((x, i) => x === d[i % 2])) return true; // same jump (both parities equal) or jumps taking turns
  return seq[0] > 0 && seq.every((x, i) => i === 0 || i === seq.length - 1 || seq[i + 1] * seq[i - 1] === x * x);
}

test('number puzzles are fair: the answer is the only number that makes the sequence follow a simple rule', () => {
  for (const id of ['add', 'subtract', 'multiply', 'alternating', 'missing-middle']) {
    for (const levelId of byId[id].levels) {
      for (const p of puzzlesOf(id, levelId, 150)) {
        const fits = [];
        for (let v = 0; v <= MAX_NUMBER; v++) {
          const seq = p.items.map((x, i) => (i === p.missingIndex ? v : x));
          if (followsSimpleRule(seq)) fits.push(v);
        }
        assert.deepEqual(fits, [p.answer], `${id}/${levelId}: ${p.items} with ${p.missingIndex} hidden fits ${fits}`);
      }
    }
  }
});

// ---- registry ----------------------------------------------------------------------------------

test('each level allows the types in the spec table', () => {
  const ids = (level) => generatorsFor(level).map((g) => g.id).sort();
  assert.deepEqual(ids('easy'), ['add', 'growing', 'repeating']);
  assert.deepEqual(ids('medium'), ['add', 'growing', 'multiply', 'repeating', 'subtract', 'two-attributes']);
  assert.deepEqual(ids('hard'), ['add', 'alternating', 'growing', 'missing-middle', 'multiply', 'repeating', 'rotation', 'subtract', 'two-attributes']);
  assert.throws(() => generatorsFor('nope'), { code: 'UNKNOWN_LEVEL' });
  assert.throws(() => getLevel('nope'), { code: 'UNKNOWN_LEVEL' });
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  assert.equal(LEVELS.easy.label, 'Easy');
});

test('a round never has the same type twice in a row, and uses variety', () => {
  for (const levelId of LEVEL_IDS) {
    for (let seed = 1; seed <= 100; seed++) {
      const round = generateRound(levelId, CASES_PER_ROUND, createRng(seed));
      assert.equal(round.length, CASES_PER_ROUND);
      for (let i = 1; i < round.length; i++) assert.notEqual(round[i].type, round[i - 1].type, `${levelId} seed ${seed}`);
      const types = new Set(round.map((p) => p.type));
      assert.ok(types.size >= Math.min(3, generatorsFor(levelId).length), `${levelId}: ${[...types]}`);
    }
  }
});

test('a new kind of pattern only needs a generator and a registry entry: the registry takes any generator list', () => {
  const custom = { id: 'custom', levels: ['easy'], generate: () => ({ type: 'custom', items: [1, 2, 3, 4, 5], missingIndex: 4, answer: 5, options: [5, 6, 7, 8], ruleText: 'Count up by one.', hint: { kind: 'x', text: 'Look at the numbers.' } }) };
  assert.equal(generatePuzzle('easy', createRng(1), { generators: [...GENERATORS, custom] }).type !== undefined, true);
  const only = generateRound('easy', 5, createRng(1), [custom]);
  assert.ok(only.every((p) => p.type === 'custom'), 'with a single type it has to repeat it');
  assert.throws(() => generatePuzzle('hard', createRng(1), { generators: [custom] }), { code: 'NO_GENERATORS' });
});

// ---- scoring -----------------------------------------------------------------------------------

test('stars from cases solved with the first pick, and a rank for each star count', () => {
  const r = (n) => Array.from({ length: 10 }, (_, i) => ({ firstTry: i < n }));
  assert.equal(roundStars(r(10)), 3);
  assert.equal(roundStars(r(9)), 3);
  assert.equal(roundStars(r(8)), 2);
  assert.equal(roundStars(r(6)), 2);
  assert.equal(roundStars(r(5)), 1);
  assert.equal(roundStars(r(0)), 1);
  assert.deepEqual([1, 2, 3].map(rankFor), ['Rookie', 'Sleuth', 'Master']);
  assert.deepEqual(RANKS, { 1: 'Rookie', 2: 'Sleuth', 3: 'Master' });
  assert.equal(roundScore(r(7)), 7 * 10 + 3 * 5);
});
