import { test } from 'node:test';
import assert from 'node:assert/strict';

import { factKey, buildFacts, makeQuestion, correctValue, questionText, fullText } from '../../src/games/times-table-racing/logic/facts.js';
import { makeOptions, swapDigits } from '../../src/games/times-table-racing/logic/distractors.js';
import { createPicker } from '../../src/games/times-table-racing/logic/questionPicker.js';
import { penalise, relax, sanitizeWeights, MAX_WEIGHT } from '../../src/games/times-table-racing/logic/weights.js';
import { defaultGhost, validateGhost, ghostProgressAt, ghostFinishMs } from '../../src/games/times-table-racing/logic/ghost.js';
import { Race } from '../../src/games/times-table-racing/logic/race.js';
import { starsForRace, ghostDifference, formatTime, formatSeconds, heatFor, raceScore, CLOSE_MS } from '../../src/games/times-table-racing/logic/scoring.js';
import { tablesKey, ghostKey, loadGhost, withRaceResult, readWeights } from '../../src/games/times-table-racing/logic/saveData.js';
import { LEVELS, LEVEL_IDS, getLevel, RACE_LENGTH, RETRY_GAP } from '../../src/games/times-table-racing/logic/levels.js';
import { createRng } from '../../src/engine/utils/random.js';

// ---- facts -------------------------------------------------------------------------

test('6 x 7 and 7 x 6 are the same fact', () => {
  assert.equal(factKey(6, 7), factKey(7, 6));
  assert.equal(factKey(6, 7), '6x7');
  assert.notEqual(factKey(6, 7), factKey(6, 8));
});

test('buildFacts lists each table against 2 to 12 with no duplicate facts', () => {
  const facts = buildFacts([2, 5, 10]);
  assert.equal(facts.length, 30, '11 + 10 + 9');
  assert.equal(new Set(facts.map((f) => f.key)).size, facts.length);
  assert.ok(facts.some((f) => f.key === '2x5' && f.table === 2), 'filed under the first table that makes it');
  assert.ok(!facts.some((f) => f.table === 5 && f.key === '2x5'));
  assert.equal(buildFacts([7]).length, 11);
  assert.equal(buildFacts([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).length, 66, 'all pairs 2..12');
});

test('buildFacts rejects an empty or out-of-range selection', () => {
  for (const bad of [[], [1], [13], [2.5], [0]]) assert.throws(() => buildFacts(bad), { code: 'NO_TABLES' });
});

test('a question shows the factors in either order and can hide a factor', () => {
  const fact = { key: '7x8', table: 7, x: 7, y: 8 };
  const rng = createRng(1);
  const orders = new Set();
  const hidden = { answer: 0, a: 0, b: 0 };
  for (let i = 0; i < 400; i++) {
    const q = makeQuestion(fact, rng, 0.35);
    orders.add(`${q.a}x${q.b}`);
    assert.equal(q.answer, 56);
    assert.equal(q.key, '7x8');
    hidden[q.missing] += 1;
  }
  assert.deepEqual([...orders].sort(), ['7x8', '8x7']);
  assert.ok(hidden.a > 40 && hidden.b > 40, `both factors get hidden (${JSON.stringify(hidden)})`);
  assert.ok(hidden.answer > 220 && hidden.answer < 300, `about 65% hide the answer (${hidden.answer})`);
  assert.equal(makeQuestion(fact, createRng(2), 0).missing, 'answer');
});

test('question text, the value to find, and the revealed fact', () => {
  assert.equal(questionText({ a: 7, b: 8, answer: 56, missing: 'answer' }), '7 × 8 = ?');
  assert.equal(questionText({ a: 7, b: 6, answer: 42, missing: 'a' }), '? × 6 = 42');
  assert.equal(questionText({ a: 7, b: 6, answer: 42, missing: 'b' }), '7 × ? = 42');
  assert.equal(correctValue({ a: 7, b: 6, answer: 42, missing: 'a' }), 7);
  assert.equal(correctValue({ a: 7, b: 6, answer: 42, missing: 'b' }), 6);
  assert.equal(correctValue({ a: 7, b: 6, answer: 42, missing: 'answer' }), 42);
  assert.equal(fullText({ a: 7, b: 8, answer: 56, missing: 'a' }), '7 × 8 = 56');
});

// ---- answer options ----------------------------------------------------------------

test('swapDigits swaps the last two digits and returns null when that gives nothing', () => {
  assert.equal(swapDigits(56), 65);
  assert.equal(swapDigits(132), 123);
  assert.equal(swapDigits(144), null, '44 swapped is the same');
  assert.equal(swapDigits(7), null, 'one digit');
  assert.equal(swapDigits(11), null);
  assert.equal(swapDigits(20), null, 'would become 02');
  assert.equal(swapDigits(100), null, '00 swapped is the same');
});

test('options are always 4 unique positive whole numbers including the answer, for every fact in every form', () => {
  const rng = createRng(99);
  for (let a = 2; a <= 12; a++) {
    for (let b = 2; b <= 12; b++) {
      for (const missing of ['answer', 'a', 'b']) {
        for (let rep = 0; rep < 6; rep++) {
          const q = { key: factKey(a, b), table: a, a, b, answer: a * b, missing };
          const options = makeOptions(q, rng);
          const label = `${questionText(q)} (${a} x ${b}) -> ${options}`;
          assert.equal(options.length, 4, label);
          assert.equal(new Set(options).size, 4, `unique: ${label}`);
          assert.ok(options.every((n) => Number.isInteger(n) && n > 0), `positive whole: ${label}`);
          assert.ok(options.includes(correctValue(q)), `has the answer: ${label}`);
        }
      }
    }
  }
});

test('the wrong options are near misses: off by a factor, digits swapped, and off by one', () => {
  const rng = createRng(5);
  for (let a = 2; a <= 12; a++) {
    for (let b = a; b <= 12; b++) {
      const q = { key: factKey(a, b), table: a, a, b, answer: a * b, missing: 'answer' };
      const wrong = makeOptions(q, rng).filter((n) => n !== q.answer);
      const near = (n) => [a, b].some((f) => Math.abs(n - q.answer) === f);
      assert.ok(wrong.some(near), `${a} x ${b}: one is the answer plus or minus a factor (${wrong})`);
      assert.ok(wrong.some((n) => Math.abs(n - q.answer) === 1), `${a} x ${b}: one is off by 1 (${wrong})`);
      const swapped = swapDigits(q.answer);
      if (swapped !== null) assert.ok(wrong.includes(swapped), `${a} x ${b}: the swapped-digit answer ${swapped} is offered (${wrong})`);
    }
  }
});

test('the options are shuffled: the answer is not always in the same place', () => {
  const rng = createRng(3);
  const q = { key: '7x8', table: 7, a: 7, b: 8, answer: 56, missing: 'answer' };
  const spots = [0, 0, 0, 0];
  for (let i = 0; i < 400; i++) spots[makeOptions(q, rng).indexOf(56)] += 1;
  assert.ok(spots.every((n) => n > 60), `answer position counts ${spots}`);
});

test('options for a hidden factor stay around that factor', () => {
  const q = { key: '6x7', table: 6, a: 7, b: 6, answer: 42, missing: 'a' };
  const options = makeOptions(q, createRng(4));
  assert.ok(options.includes(7));
  assert.ok(options.every((n) => Math.abs(n - 7) <= 3));
});

// ---- picking questions -------------------------------------------------------------

const facts10 = buildFacts([7]).slice(0, 10);

test('the picker never asks the same fact twice in a row', () => {
  const picker = createPicker({ facts: facts10, rng: createRng(1) });
  let last = null;
  for (let i = 0; i < 2000; i++) {
    const fact = picker.next();
    assert.notEqual(fact.key, last);
    last = fact.key;
  }
});

test('with a single fact the picker has no choice but to repeat it', () => {
  const picker = createPicker({ facts: [facts10[0]], rng: createRng(1) });
  assert.equal(picker.next().key, picker.next().key);
});

test('an empty fact list is an error', () => {
  assert.throws(() => createPicker({ facts: [], rng: createRng(1) }), { code: 'NO_FACTS' });
});

test('a fact with a higher weight is asked more often', () => {
  const heavy = facts10[3].key;
  const picker = createPicker({ facts: facts10, weights: { [heavy]: 3 }, rng: createRng(8) });
  const counts = {};
  for (let i = 0; i < 6000; i++) {
    const { key } = picker.next();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const others = Object.entries(counts).filter(([k]) => k !== heavy).map(([, n]) => n);
  const average = others.reduce((a, b) => a + b, 0) / others.length;
  assert.ok(counts[heavy] > average * 2, `weighted fact ${counts[heavy]} vs average ${average.toFixed(0)}`);
});

test('a missed fact comes back after a few other questions, and only once', () => {
  const picker = createPicker({ facts: facts10, rng: createRng(2) });
  const missed = picker.next();
  picker.retry(missed);
  picker.retry(missed); // asking twice does not queue it twice
  const next = [];
  for (let i = 0; i < RETRY_GAP + 1; i++) next.push(picker.next().key);
  assert.deepEqual(next.slice(0, RETRY_GAP).includes(missed.key), false, 'not straight away');
  assert.equal(next[RETRY_GAP], missed.key, `back after ${RETRY_GAP} other questions`);
  const after = Array.from({ length: 12 }, () => picker.next().key);
  assert.equal(after.filter((k) => k === missed.key).length <= 2, true);
});

// ---- weights -----------------------------------------------------------------------

test('a miss triples the weight up to a cap; a right answer halves it and then removes it', () => {
  let w = {};
  w = penalise(w, '7x8');
  assert.equal(w['7x8'], 3);
  w = penalise(penalise(penalise(w, '7x8'), '7x8'), '7x8');
  assert.equal(w['7x8'], MAX_WEIGHT);
  w = relax(w, '7x8');
  assert.equal(w['7x8'], MAX_WEIGHT / 2);
  let small = penalise({}, '2x3'); // 3
  small = relax(small, '2x3'); // 1.5
  assert.equal(small['2x3'], 1.5);
  small = relax(small, '2x3'); // 0.75 -> dropped
  assert.ok(!('2x3' in small));
  assert.deepEqual(relax({}, '9x9'), {}, 'relaxing an unknown fact changes nothing');
});

test('weight helpers never change the object they are given', () => {
  const w = Object.freeze({ '7x8': 3 });
  penalise(w, '7x8');
  relax(w, '7x8');
  assert.deepEqual(w, { '7x8': 3 });
});

test('weights read from storage are cleaned', () => {
  assert.deepEqual(sanitizeWeights({ '7x8': 3, 'bad': 5, '6x7': 'x', '5x5': 1, '9x9': 1e9, '2x3': NaN }), { '7x8': 3, '9x9': MAX_WEIGHT });
  for (const junk of [null, undefined, 5, 'a', []]) assert.deepEqual(sanitizeWeights(junk), {});
});

// ---- ghost -------------------------------------------------------------------------

test('the default ghost answers at a steady pace and finishes after 20 answers', () => {
  const ghost = defaultGhost(5000, 'mixed');
  assert.equal(ghost.times.length, RACE_LENGTH);
  assert.equal(ghost.times[0], 5000);
  assert.equal(ghostFinishMs(ghost), 100000);
  assert.equal(ghost.table, 'mixed');
});

test('the ghost replays a saved run to the millisecond: it steps forward exactly at each saved time', () => {
  const times = Array.from({ length: RACE_LENGTH }, (_, i) => 1000 + i * 1234 + (i % 3) * 77);
  const run = { table: 'mixed', times };
  for (let i = 0; i < times.length; i++) {
    assert.equal(ghostProgressAt(run, times[i] - 1), i / RACE_LENGTH, `1 ms before answer ${i + 1}`);
    assert.equal(ghostProgressAt(run, times[i]), (i + 1) / RACE_LENGTH, `at answer ${i + 1}`);
    assert.equal(ghostProgressAt(run, times[i] + 49), (i + 1) / RACE_LENGTH, `49 ms after answer ${i + 1}`);
  }
  assert.equal(ghostProgressAt(run, 0), 0);
  assert.equal(ghostProgressAt(run, 1e9), 1);
});

test('ghost progress never goes backwards over time', () => {
  const run = defaultGhost(3000, 'mixed');
  let last = 0;
  for (let t = 0; t <= 70000; t += 37) {
    const p = ghostProgressAt(run, t);
    assert.ok(p >= last);
    last = p;
  }
});

test('answers given at the same millisecond all count', () => {
  const run = { table: 'x', times: [100, 100, 100, 200] };
  assert.equal(ghostProgressAt(run, 100), 0.75);
});

test('damaged ghosts are rejected', () => {
  const good = defaultGhost(3000, 'mixed');
  assert.equal(validateGhost(good), good);
  const bad = [
    null, undefined, 5, 'ghost', {}, { table: 'x' }, { table: 'x', times: 'no' },
    { table: 'x', times: good.times.slice(1) },
    { table: 'x', times: [...good.times.slice(0, 19), NaN] },
    { table: 'x', times: [-1, ...good.times.slice(1)] },
    { table: 'x', times: [...good.times.slice(0, 18), 90000, 10] },
    { table: 5, times: good.times },
  ];
  for (const run of bad) assert.equal(validateGhost(run), null, JSON.stringify(run));
});

// ---- the race ----------------------------------------------------------------------

const answerRight = (race, at) => race.answer(correctValue(race.question), at);
const answerWrong = (race, at) => race.answer(correctValue(race.question) + 1000, at);

test('a race ends after exactly 20 correct answers and the car only moves forward', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(1) });
  let progress = 0;
  for (let i = 1; i <= RACE_LENGTH; i++) {
    assert.equal(race.finished, false);
    const result = answerRight(race, i * 1000);
    assert.equal(result.kind, 'correct');
    assert.ok(result.progress > progress, 'progress grows on every correct answer');
    progress = result.progress;
  }
  assert.equal(race.finished, true);
  assert.equal(progress, 1);
  assert.throws(() => answerRight(race, 21000), { code: 'RACE_FINISHED' });
});

test('wrong answers do not move the car, and the fact comes back later', () => {
  const race = new Race({ levelId: 'medium', rng: createRng(7) });
  const missed = race.question.key;
  const result = answerWrong(race, 1000);
  assert.equal(result.kind, 'wrong');
  assert.equal(result.progress, 0);
  assert.equal(result.finished, false);
  assert.match(result.equation, /^\d+ × \d+ = \d+$/, 'the right fact is returned to show');
  const seen = [];
  for (let i = 0; i < 8 && !seen.includes(missed); i++) {
    seen.push(race.question.key);
    answerRight(race, 2000 + i);
  }
  assert.ok(seen.includes(missed), `the missed fact ${missed} came back within 8 questions (${seen})`);
  assert.ok(seen.indexOf(missed) >= RETRY_GAP, 'but not straight away');
});

test('the same fact can be shown the other way round and still counts as the same fact', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(11) });
  const keys = new Set();
  for (let i = 0; i < RACE_LENGTH; i++) {
    keys.add(race.question.key);
    answerRight(race, i);
  }
  for (const key of keys) assert.match(key, /^\d+x\d+$/);
});

test('the summary has the times, accuracy per table and the new weights', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(3) });
  const firstKey = race.question.key;
  const firstTable = race.question.table;
  answerWrong(race, 500);
  for (let i = 1; i <= RACE_LENGTH; i++) answerRight(race, 1000 + i * 100);
  const s = race.summary();
  assert.equal(s.times.length, RACE_LENGTH);
  assert.equal(s.finishMs, s.times[RACE_LENGTH - 1]);
  assert.deepEqual(s.times, [...s.times].sort((a, b) => a - b));
  assert.equal(s.wrong, 1);
  assert.equal(s.firstTry, s.asked - 1, 'every fact asked was right first time except the miss');
  assert.equal(s.weights[firstKey], 3, 'the missed fact is now 3 times as likely');
  const stats = Object.values(s.perTable);
  assert.equal(stats.reduce((n, t) => n + t.asked, 0), s.asked);
  assert.equal(stats.reduce((n, t) => n + t.correct, 0), s.firstTry);
  assert.equal(s.perTable[firstTable].asked > s.perTable[firstTable].correct, true, 'the missed table shows it');
  assert.deepEqual(s.tables, LEVELS.easy.tables);
});

test('retries do not count again towards accuracy or weights', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(21) });
  const key = race.question.key;
  answerWrong(race, 100);
  let misses = 1;
  while (!race.finished) {
    // Miss the fact again on its next two showings, then get everything right.
    if (race.question.key === key && misses < 3) {
      answerWrong(race, 200);
      misses += 1;
    } else answerRight(race, 300);
  }
  const s = race.summary();
  assert.equal(misses, 3, 'the fact came back often enough to miss it three times');
  assert.equal(s.wrong, 3);
  assert.equal(s.weights[key], 3, 'tripled once, not once per miss');
  assert.equal(s.asked - s.firstTry, 1, 'only the first showing of that fact counts as a miss in the accuracy');
});

test('a fact missed in a race keeps its extra weight even if it is later answered right', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(3) });
  const key = race.question.key;
  answerWrong(race, 100);
  let freshRight = false;
  for (let i = 0; i < 200 && !race.finished; i++) {
    // Answer the missed fact right each time it appears again (as the retry and as any later fresh draw).
    if (race.question.key === key) freshRight = true;
    answerRight(race, 200 + i);
  }
  assert.ok(freshRight);
  assert.equal(race.summary().weights[key], 3);
});

test('a fact answered right first time loses some of its extra weight', () => {
  const all = Object.fromEntries(buildFacts(LEVELS.easy.tables).map((f) => [f.key, 9]));
  const race = new Race({ levelId: 'easy', rng: createRng(30), weights: all });
  const asked = new Set();
  while (!race.finished) {
    asked.add(race.question.key);
    answerRight(race, 0);
  }
  const weights = race.summary().weights;
  for (const f of buildFacts(LEVELS.easy.tables)) assert.equal(weights[f.key], asked.has(f.key) ? 4.5 : 9, f.key);
});

test('missed facts appear more often in the next race', () => {
  // Race 1: miss one fact. Race 2, started with the weights race 1 produced, asks it more often.
  const race1 = new Race({ levelId: 'easy', rng: createRng(1) });
  const missed = race1.question.key;
  answerWrong(race1, 1);
  while (!race1.finished) answerRight(race1, 2);
  const weights = race1.summary().weights;
  assert.equal(weights[missed], 3);

  const first = (w, seed) => new Race({ levelId: 'easy', rng: createRng(seed), weights: w }).question.key;
  let withWeights = 0;
  let without = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    if (first(weights, seed) === missed) withWeights += 1;
    if (first({}, seed) === missed) without += 1;
  }
  assert.ok(withWeights > without * 2, `asked first ${withWeights} times with weights, ${without} without`);
});

test('typing mode (Hard) has no options and accepts typed text, and ignores non-numbers', () => {
  const race = new Race({ levelId: 'hard', rng: createRng(5) });
  assert.equal(race.options, null);
  for (const text of ['', 'abc', '-3', '7.5', '12345']) {
    const r = race.answer(text, 10);
    assert.equal(r.kind, 'invalid', JSON.stringify(text));
  }
  assert.equal(race.correct, 0);
  const result = race.answer(` ${correctValue(race.question)} `, 20);
  assert.equal(result.kind, 'correct');
});

test('Hard asks for hidden factors sometimes, and the typed answer is that factor', () => {
  const race = new Race({ levelId: 'hard', rng: createRng(12) });
  let hidden = 0;
  for (let i = 0; i < RACE_LENGTH; i++) {
    const q = race.question;
    if (q.missing !== 'answer') hidden += 1;
    assert.equal(race.answer(String(correctValue(q)), i).kind, 'correct');
  }
  assert.ok(hidden > 0, 'saw a missing-factor question');
});

test('choice levels offer 4 options that include the answer', () => {
  for (const levelId of ['easy', 'medium']) {
    const race = new Race({ levelId, rng: createRng(2) });
    for (let i = 0; i < RACE_LENGTH; i++) {
      assert.equal(race.options.length, 4);
      assert.ok(race.options.includes(correctValue(race.question)));
      answerRight(race, i);
    }
  }
});

test('Easy only asks tables 2, 5 and 10; chosen tables are respected', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(4) });
  for (let i = 0; i < RACE_LENGTH; i++) {
    assert.ok([2, 5, 10].includes(race.question.table), `table ${race.question.table}`);
    answerRight(race, i);
  }
  const only7 = new Race({ levelId: 'medium', tables: [7], rng: createRng(4) });
  for (let i = 0; i < RACE_LENGTH; i++) {
    const q = only7.question;
    assert.ok(q.a === 7 || q.b === 7, `${questionText(q)} involves 7`);
    answerRight(only7, i);
  }
});

test('recorded times never go backwards, even if the clock does', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(6) });
  answerRight(race, 5000);
  answerRight(race, 3000);
  for (let i = 0; i < RACE_LENGTH - 2; i++) answerRight(race, 6000);
  const { times } = race.summary();
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('bad input to the race is an error, not a silent failure', () => {
  const race = new Race({ levelId: 'easy', rng: createRng(1) });
  assert.throws(() => race.answer(5, NaN), { code: 'BAD_TIME' });
  assert.throws(() => race.answer(5, -1), { code: 'BAD_TIME' });
  assert.throws(() => race.summary(), { code: 'RACE_UNFINISHED' });
  assert.throws(() => new Race({ levelId: 'nope', rng: createRng(1) }), { code: 'UNKNOWN_LEVEL' });
});

test('levels match the spec table', () => {
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  assert.deepEqual(LEVELS.easy.tables, [2, 5, 10]);
  assert.deepEqual(LEVELS.medium.tables, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(LEVELS.hard.tables, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].mode), ['choice', 'choice', 'type']);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].ghostPaceMs), [5000, 4000, 3000]);
  assert.equal(LEVELS.hard.missingFactorChance > 0 && LEVELS.medium.missingFactorChance === 0, true);
  assert.throws(() => getLevel('x'), { code: 'UNKNOWN_LEVEL' });
});

// ---- scoring -----------------------------------------------------------------------

test('stars by time against the ghost', () => {
  assert.equal(starsForRace(59999, 60000), 3, 'beat the ghost');
  assert.equal(starsForRace(60000, 60000), 2, 'a tie is not a win');
  assert.equal(starsForRace(60000 + CLOSE_MS, 60000), 2, 'within 5 s');
  assert.equal(starsForRace(60000 + CLOSE_MS + 1, 60000), 1, 'finished');
});

test('the difference to the ghost is negative when ahead', () => {
  assert.equal(ghostDifference(58000, 60000), -2000);
  assert.equal(ghostDifference(63000, 60000), 3000);
});

test('times are shown as minutes, seconds and tenths', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(72340), '1:12.3');
  assert.equal(formatTime(59999), '0:59.9');
  assert.equal(formatTime(600000), '10:00.0');
  assert.equal(formatSeconds(-2400), '2.4 s');
});

test('the heat strip labels each table by how it went', () => {
  assert.equal(heatFor({ asked: 5, correct: 5 }), 'strong');
  assert.equal(heatFor({ asked: 10, correct: 9 }), 'strong');
  assert.equal(heatFor({ asked: 10, correct: 7 }), 'ok');
  assert.equal(heatFor({ asked: 10, correct: 6 }), 'practise');
  assert.equal(heatFor({ asked: 0, correct: 0 }), 'practise');
  assert.equal(raceScore(18), 180);
});

// ---- saved data --------------------------------------------------------------------

test('a table choice has a stable name: "mixed" for the level\'s own tables', () => {
  assert.equal(tablesKey(undefined, LEVELS.easy), 'mixed');
  assert.equal(tablesKey([], LEVELS.easy), 'mixed');
  assert.equal(tablesKey([10, 5, 2], LEVELS.easy), 'mixed');
  assert.equal(tablesKey([5, 2], LEVELS.easy), '2-5');
  assert.equal(tablesKey([7, 3, 7], LEVELS.medium), '3-7');
  assert.equal(ghostKey('easy', 'mixed'), 'easy:mixed');
});

test('the saved best run is used as the ghost; a missing one falls back to the default pace', () => {
  const run = { table: 'mixed', times: Array.from({ length: RACE_LENGTH }, (_, i) => (i + 1) * 2000) };
  const extra = { ghosts: { 'easy:mixed': run } };
  const quiet = { error: () => assert.fail('no error expected') };
  assert.deepEqual(loadGhost(extra, 'easy', 'mixed', 5000, quiet), { run, isDefault: false });
  const fallback = loadGhost({}, 'easy', 'mixed', 5000, quiet);
  assert.equal(fallback.isDefault, true);
  assert.equal(fallback.run.times[0], 5000);
  assert.equal(loadGhost(undefined, 'hard', 'mixed', 3000, quiet).run.times[0], 3000);
});

test('a damaged saved ghost falls back to the default and is logged', () => {
  const logged = [];
  const result = loadGhost({ ghosts: { 'easy:mixed': { table: 'mixed', times: [1, 2, 3] } } }, 'easy', 'mixed', 5000, { error: (...args) => logged.push(args) });
  assert.equal(result.isDefault, true);
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][0]), /easy:mixed/);
});

test('a faster run replaces the saved ghost; a slower one does not; weights are always stored', () => {
  const slow = { table: 'mixed', times: Array.from({ length: RACE_LENGTH }, (_, i) => (i + 1) * 3000) };
  const fast = { table: 'mixed', times: Array.from({ length: RACE_LENGTH }, (_, i) => (i + 1) * 2000) };
  const first = withRaceResult({}, { levelId: 'easy', table: 'mixed', run: slow, weights: { '7x8': 3 } });
  assert.equal(first.newBest, true);
  assert.deepEqual(first.extra.ghosts['easy:mixed'].times, slow.times);
  assert.deepEqual(first.extra.weights, { '7x8': 3 });

  const better = withRaceResult(first.extra, { levelId: 'easy', table: 'mixed', run: fast, weights: {} });
  assert.equal(better.newBest, true);
  assert.deepEqual(better.extra.ghosts['easy:mixed'].times, fast.times);

  const worse = withRaceResult(better.extra, { levelId: 'easy', table: 'mixed', run: slow, weights: { '2x3': 3 } });
  assert.equal(worse.newBest, false);
  assert.deepEqual(worse.extra.ghosts['easy:mixed'].times, fast.times, 'the best run stays');
  assert.deepEqual(worse.extra.weights, { '2x3': 3 });
  assert.ok(first.extra.ghosts['easy:mixed'], 'the extra passed in was not changed');
  assert.deepEqual(readWeights(worse.extra), { '2x3': 3 });
});

test('a ghost is saved separately for each level and each table choice', () => {
  const run = defaultGhost(1000, 'x');
  let { extra } = withRaceResult({}, { levelId: 'easy', table: 'mixed', run, weights: {} });
  ({ extra } = withRaceResult(extra, { levelId: 'easy', table: '2-5', run, weights: {} }));
  ({ extra } = withRaceResult(extra, { levelId: 'hard', table: 'mixed', run, weights: {} }));
  assert.deepEqual(Object.keys(extra.ghosts).sort(), ['easy:2-5', 'easy:mixed', 'hard:mixed']);
});
