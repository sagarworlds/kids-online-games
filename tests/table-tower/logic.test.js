import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GameError } from '../../src/engine/utils/errors.js';
import { createRng } from '../../src/engine/utils/random.js';
import {
  FLOORS, FACTS_PER_FLOOR, CLEAR_STARS, LEVELS, LEVEL_IDS, isFloor, levelOfFloor, floorsOf, challengeSeconds, floorKey, ladderKey, revisionKey,
  isFloorOpen, clearedFloors,
} from '../../src/games/table-tower/logic/levels.js';
import { factKey, makeFact, parseFactKey, factsForFloor, allFacts, floorsOfFact } from '../../src/games/table-tower/logic/facts.js';
import { splitNumber, explainSplit, skipCount, workingFor, TRICKS, trickFor } from '../../src/games/table-tower/logic/splits.js';
import { makeQuestion, pickHide, makeChoices, parseAnswer, describeAnswer } from '../../src/games/table-tower/logic/questions.js';
import { createLadder, nextRung, rungBelow, submitRung, hintFor, revealText, REVEAL_AFTER } from '../../src/games/table-tower/logic/ladder.js';
import {
  MAX_BOX, BOX_DAYS, dayNumber, sanitizeMemory, recordAnswer, applyResults, isDue, weightOf, dueKeys, UNSEEN_WEIGHT,
} from '../../src/games/table-tower/logic/memory.js';
import {
  QuizSession, buildChallenge, buildRevision, pickWeighted, REQUEUE_GAP, MAX_REQUEUES, REVISION_QUESTIONS, REVIEW_QUESTIONS,
} from '../../src/games/table-tower/logic/session.js';
import { quizStars, ladderStars, challengeScore } from '../../src/games/table-tower/logic/scoring.js';

/** The code of the error thrown by `fn`. */
function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GameError, `expected a GameError but got ${error}`);
    return error.code;
  }
  return null;
}
const quiet = { error() {} };

// ---- levels and the tower ---------------------------------------------------------------------

test('the tower has 30 floors in three levels of 10: tables 1 to 10, 11 to 20 and 21 to 30', () => {
  assert.equal(FLOORS, 30);
  assert.deepEqual(LEVEL_IDS, ['easy', 'medium', 'hard']);
  assert.deepEqual(LEVEL_IDS.map((id) => [LEVELS[id].firstFloor, LEVELS[id].lastFloor]), [[1, 10], [11, 20], [21, 30]]);
  assert.deepEqual(floorsOf(LEVELS.medium), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  for (let floor = 1; floor <= FLOORS; floor++) assert.ok(floorsOf(levelOfFloor(floor)).includes(floor));
  assert.equal(codeOf(() => levelOfFloor(0)), 'BAD_FLOOR');
  assert.equal(codeOf(() => levelOfFloor(31)), 'BAD_FLOOR');
  assert.equal(isFloor(30), true);
  assert.equal(isFloor(31), false);
  assert.equal(isFloor(2.5), false);
  assert.equal(isFloor('3'), false);
});

test('levels: easy is multiple choice, medium and hard are typed, and only hard hides a factor', () => {
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].answerMode), ['choice', 'typed', 'typed']);
  assert.deepEqual(LEVEL_IDS.map((id) => LEVELS[id].hiddenFactorShare > 0), [false, false, true]);
  assert.ok(LEVEL_IDS.every((id) => LEVELS[id].questions === FACTS_PER_FLOOR + REVIEW_QUESTIONS), 'ten facts and two to review');
  assert.deepEqual(LEVEL_IDS.map((id) => challengeSeconds(LEVELS[id])), [96, 120, 168]);
  assert.throws(() => { LEVELS.easy.questions = 3; }, TypeError);
});

test('save keys for floors, ladders and revision', () => {
  assert.equal(floorKey(17), 'floor-17');
  assert.equal(ladderKey(17), 'ladder-17');
  assert.equal(revisionKey('hard'), 'revision-hard');
});

test('a floor opens when the one below is cleared; the first floor of every level is always open', () => {
  const none = new Set();
  assert.deepEqual([1, 2, 11, 12, 21, 22].map((f) => isFloorOpen(f, none)), [true, false, true, false, true, false]);
  assert.equal(isFloorOpen(12, new Set([11])), true);
  assert.equal(isFloorOpen(12, new Set([10])), false, 'only the floor right below counts');
  assert.equal(isFloorOpen(30, new Set([29])), true);
  assert.equal(codeOf(() => isFloorOpen(40, none)), 'BAD_FLOOR');
});

test('a floor is cleared at two stars in the challenge, and not by the ladder or revision', () => {
  assert.equal(CLEAR_STARS, 2);
  const cleared = clearedFloors({ 'floor-1': 3, 'floor-2': 2, 'floor-3': 1, 'ladder-4': 3, 'revision-easy': 3, 'floor-31': 3 });
  assert.deepEqual([...cleared], [1, 2]);
  assert.deepEqual([...clearedFloors({})], []);
});

// ---- facts ------------------------------------------------------------------------------------

test('a fact is the same whichever way round it is written', () => {
  assert.equal(factKey(6, 7), factKey(7, 6));
  assert.equal(factKey(6, 17), '6x17');
  assert.equal(factKey(17, 6), '6x17');
  const fact = makeFact(17, 6);
  assert.deepEqual({ ...fact }, { key: '6x17', small: 6, large: 17, product: 102 });
  assert.throws(() => { fact.product = 1; }, TypeError, 'facts cannot be changed');
});

test('makeFact only accepts what the tower asks: the smaller factor 1 to 10 and the larger up to 30', () => {
  for (const [a, b] of [[0, 5], [11, 11], [11, 12], [31, 2], [2.5, 4], ['3', 4], [-1, 3]]) assert.equal(codeOf(() => makeFact(a, b)), 'BAD_FACT', `${a} x ${b}`);
  assert.equal(makeFact(30, 10).product, 300);
  assert.equal(makeFact(1, 1).product, 1);
});

test('parseFactKey reads good keys and refuses bad ones', () => {
  assert.deepEqual({ ...parseFactKey('6x17') }, { ...makeFact(6, 17) });
  for (const bad of ['17x6', '6x', 'x6', '6*17', '', null, undefined, 42, '6x17 ', '0x5', '11x12', '3x40']) assert.equal(codeOf(() => parseFactKey(bad)), 'BAD_FACT', String(bad));
});

test('each floor has ten facts, the table times 1 to 10', () => {
  for (let floor = 1; floor <= FLOORS; floor++) {
    const facts = factsForFloor(floor);
    assert.equal(facts.length, 10);
    assert.deepEqual(facts.map((f) => f.product), Array.from({ length: 10 }, (_, i) => floor * (i + 1)), `floor ${floor}`);
    assert.equal(new Set(facts.map((f) => f.key)).size, 10);
  }
  assert.equal(codeOf(() => factsForFloor(31)), 'BAD_FACT');
});

test('there are 255 different facts, because tables up to 10 share their facts', () => {
  const facts = allFacts();
  assert.equal(facts.length, 255);
  assert.equal(new Set(facts.map((f) => f.key)).size, 255);
  assert.ok(facts.every((f) => f.product === f.small * f.large));
});

test('a fact is on the floor of each factor that is 10 or less (and 30 or less)', () => {
  assert.deepEqual(floorsOfFact(makeFact(6, 7)), [6, 7]);
  assert.deepEqual(floorsOfFact(makeFact(7, 7)), [7]);
  assert.deepEqual(floorsOfFact(makeFact(6, 17)), [17]);
  assert.deepEqual(floorsOfFact(makeFact(10, 10)), [10]);
  for (const fact of allFacts()) for (const floor of floorsOfFact(fact)) assert.ok(factsForFloor(floor).some((f) => f.key === fact.key));
});

// ---- splitting and tricks ---------------------------------------------------------------------

test('splitNumber: the parts add up to the table, and 17 is 10 + 7', () => {
  for (let n = 1; n <= FLOORS; n++) {
    const parts = splitNumber(n);
    assert.equal(parts.reduce((a, b) => a + b, 0), n, `parts of ${n}`);
    assert.ok(parts.every((p) => Number.isInteger(p) && p >= 1));
    assert.ok(parts.length <= 2);
  }
  assert.deepEqual(splitNumber(17), [10, 7]);
  assert.deepEqual(splitNumber(29), [20, 9]);
  assert.deepEqual(splitNumber(20), [10, 10]);
  assert.deepEqual(splitNumber(30), [10, 20]);
  assert.deepEqual(splitNumber(7), [5, 2]);
  assert.deepEqual(splitNumber(3), [3]);
  assert.deepEqual(splitNumber(10), [10]);
  assert.equal(codeOf(() => splitNumber(0)), 'BAD_FLOOR');
  assert.equal(codeOf(() => splitNumber(31)), 'BAD_FLOOR');
});

test('explainSplit: 17 x 6 is (10 x 6) + (7 x 6) = 60 + 42 = 102, and the working is right for every fact', () => {
  assert.equal(explainSplit(17, 6).text, '(10 × 6) + (7 × 6) = 60 + 42 = 102');
  assert.equal(explainSplit(3, 4).text, '3 × 4 = 12');
  assert.equal(explainSplit(7, 8).text, '(5 × 8) + (2 × 8) = 40 + 16 = 56');
  for (let n = 1; n <= FLOORS; n++) {
    for (let m = 1; m <= FACTS_PER_FLOOR; m++) {
      const e = explainSplit(n, m);
      assert.equal(e.total, n * m);
      assert.equal(e.parts.reduce((sum, p) => sum + p.product, 0), n * m, `${n} x ${m}`);
      assert.ok(e.parts.every((p) => p.product === p.factor * m));
    }
  }
});

test('workingFor: the split when there is one, otherwise counting in jumps', () => {
  assert.equal(workingFor(17, 6), '(10 × 6) + (7 × 6) = 60 + 42 = 102');
  assert.equal(workingFor(3, 4), 'Count in 3s: 3, 6, 9, 12. That is 4 jumps, so 3 × 4 = 12.');
  assert.equal(workingFor(10, 7), 'Count in 10s: 10, 20, 30, 40, 50, 60, 70. That is 7 jumps, so 10 × 7 = 70.');
  assert.equal(workingFor(4, 1), '4 × 1 = 4: just one group of 4.');
  for (let n = 1; n <= FLOORS; n++) for (let m = 1; m <= FACTS_PER_FLOOR; m++) assert.ok(workingFor(n, m).includes(String(n * m)), `${n} x ${m}`);
});

test('skipCount: the jumps of a table', () => {
  assert.deepEqual(skipCount(17), [17, 34, 51, 68, 85, 102, 119, 136, 153, 170]);
  assert.deepEqual(skipCount(3, 4), [3, 6, 9, 12]);
});

test('tricks: only for 11, 19 and 25, and every step ends on the right answer', () => {
  assert.deepEqual(Object.keys(TRICKS).map(Number), [11, 19, 25]);
  for (let floor = 1; floor <= FLOORS; floor++) assert.equal(trickFor(floor) === null, ![11, 19, 25].includes(floor), `floor ${floor}`);
  for (const [floor, trick] of Object.entries(TRICKS)) {
    assert.equal(trick.floor, Number(floor));
    assert.ok(trick.title && trick.rule && trick.id);
    for (let m = 1; m <= FACTS_PER_FLOOR; m++) {
      const { lines, result } = trick.steps(m);
      assert.equal(result, Number(floor) * m, `${floor} x ${m}`);
      assert.ok(lines.length >= 2 && lines.every((line) => line.length > 0));
    }
  }
  assert.deepEqual(trickFor(11).steps(7).lines, ['11 × 7', 'Write 7 twice: 77']);
  assert.deepEqual(trickFor(19).steps(6).lines, ['20 × 6 = 120', '120 − 6 = 114']);
  assert.deepEqual(trickFor(25).steps(6).lines, ['6 × 100 = 600', '600 ÷ 4 = 150']);
  assert.equal(trickFor(11).steps(10).result, 110);
});

// ---- questions --------------------------------------------------------------------------------

test('makeQuestion: the table and the multiplier, either way round', () => {
  const fact = makeFact(17, 6);
  const seen = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const q = makeQuestion({ fact, floor: 17, rng: createRng(seed) });
    assert.equal(q.key, '6x17');
    assert.equal(q.table, 17);
    assert.equal(q.multiplier, 6);
    assert.equal(q.answer, 102);
    assert.equal(q.hide, 'product');
    assert.ok(['17 × 6 = ?', '6 × 17 = ?'].includes(q.prompt), q.prompt);
    assert.equal(q.flipped, q.prompt === '6 × 17 = ?');
    seen.add(q.prompt);
  }
  assert.equal(seen.size, 2, 'both orders appear');
});

test('makeQuestion: a fact on two floors takes its table from the floor it is asked on', () => {
  const fact = makeFact(6, 7);
  assert.deepEqual([6, 7, undefined, 9].map((floor) => makeQuestion({ fact, floor, rng: createRng(1) }).table), [6, 7, 7, 7]);
  const q = makeQuestion({ fact, floor: 6, rng: createRng(1) });
  assert.equal(q.multiplier, 7);
});

test('makeQuestion: hiding the multiplier asks for it, with the product shown', () => {
  const fact = makeFact(17, 6);
  const prompts = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const q = makeQuestion({ fact, floor: 17, rng: createRng(seed), hide: 'multiplier' });
    assert.equal(q.answer, 6);
    assert.equal(q.product, 102);
    prompts.add(q.prompt);
  }
  assert.deepEqual([...prompts].sort(), ['17 × ? = 102', '? × 17 = 102']);
});

test('pickHide: only hard hides a factor, about a quarter of the time', () => {
  const rng = createRng(5);
  assert.ok(Array.from({ length: 200 }, () => pickHide(LEVELS.easy, rng)).every((h) => h === 'product'));
  const hard = Array.from({ length: 2000 }, () => pickHide(LEVELS.hard, rng)).filter((h) => h === 'multiplier').length;
  assert.ok(hard > 400 && hard < 600, `hid ${hard} of 2000`);
});

test('makeChoices: four different whole numbers above zero with the right one in, for every fact', () => {
  const rng = createRng(9);
  for (const fact of allFacts()) {
    for (const hide of ['product', 'multiplier']) {
      for (const floor of floorsOfFact(fact)) {
        const q = makeQuestion({ fact, floor, rng, hide });
        const options = makeChoices(q, rng);
        assert.equal(options.length, 4, q.prompt);
        assert.equal(new Set(options).size, 4, `${q.prompt}: ${options}`);
        assert.ok(options.includes(q.answer));
        assert.ok(options.every((n) => Number.isInteger(n) && n > 0), `${q.prompt}: ${options}`);
      }
    }
  }
});

test('makeChoices: the wrong options are near misses, such as one group out', () => {
  const q = makeQuestion({ fact: makeFact(17, 6), floor: 17, rng: createRng(1) });
  const near = new Set([102 + 17, 102 - 17, 102 + 6, 102 - 6, 112, 92, 120, 103, 101]);
  for (let seed = 1; seed < 30; seed++) {
    const wrong = makeChoices(q, createRng(seed)).filter((n) => n !== 102);
    assert.ok(wrong.every((n) => near.has(n)), `${wrong}`);
  }
});

test('parseAnswer: whole numbers of up to four digits only', () => {
  assert.equal(parseAnswer('102'), 102);
  assert.equal(parseAnswer('  7 '), 7);
  assert.equal(parseAnswer('0'), 0);
  for (const bad of ['', '  ', '1.5', '-3', '1e3', 'abc', '12345', '1 2', null, undefined, 7]) assert.equal(parseAnswer(bad), null, String(bad));
});

test('describeAnswer shows the whole fact', () => {
  assert.equal(describeAnswer(makeQuestion({ fact: makeFact(17, 6), floor: 17, rng: createRng(1) })), '17 × 6 = 102');
  assert.equal(describeAnswer(makeQuestion({ fact: makeFact(17, 6), floor: 17, rng: createRng(1), hide: 'multiplier' })), '17 × 6 = 102, so the missing number is 6');
});

// ---- the ladder -------------------------------------------------------------------------------

test('ladder: climbing right answers fills every rung and finishes with no mistakes', () => {
  let ladder = createLadder(17);
  const climbed = [];
  while (!ladder.done) {
    const expected = nextRung(ladder);
    const result = submitRung(ladder, expected);
    assert.equal(result.correct, true);
    assert.equal(result.revealed, false);
    climbed.push(expected);
    ladder = result.ladder;
  }
  assert.deepEqual(climbed, [17, 34, 51, 68, 85, 102, 119, 136, 153, 170]);
  assert.equal(ladder.mistakes, 0);
  assert.equal(ladder.filled, 10);
  assert.equal(nextRung(ladder), null);
  assert.equal(codeOf(() => submitRung(ladder, 187)), 'LADDER_DONE');
});

test('ladder: a wrong number counts a mistake and stays on the rung; the state is never changed in place', () => {
  const start = createLadder(7);
  const wrong = submitRung(start, 8);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.expected, 7);
  assert.equal(wrong.ladder.mistakes, 1);
  assert.equal(wrong.ladder.filled, 0);
  assert.deepEqual(start, createLadder(7), 'the old state is untouched');
  const right = submitRung(wrong.ladder, 7);
  assert.equal(right.ladder.filled, 1);
  assert.equal(right.ladder.mistakes, 1, 'the mistake is kept');
  assert.equal(right.ladder.missesOnRung, 0, 'the count of misses starts again on the next rung');
});

test('ladder: after three misses on one rung it is filled in, shown, and the child can go on', () => {
  assert.equal(REVEAL_AFTER, 3);
  let ladder = createLadder(17);
  ladder = submitRung(ladder, 17).ladder;
  let result;
  for (let i = 0; i < REVEAL_AFTER; i++) {
    result = submitRung(ladder, 30 + i);
    ladder = result.ladder;
    assert.equal(result.revealed, i === REVEAL_AFTER - 1);
  }
  assert.equal(ladder.filled, 2);
  assert.deepEqual(ladder.shown, [2]);
  assert.equal(ladder.mistakes, 3);
  assert.equal(result.expected, 34);
  assert.equal(revealText(createLadder(17), 34), 'The next rung is 34: 17 + 17 = 34.');
});

test('ladder: hints show how to find the rung without giving it away', () => {
  assert.equal(hintFor(createLadder(17)), 'The first rung is 17 × 1. Start with 17.');
  const second = submitRung(createLadder(17), 17).ladder;
  assert.equal(hintFor(second), 'Jump 17 more: 17 + 17 = ?');
  assert.equal(rungBelow(second), 17);
  assert.ok(!hintFor(second).includes('34'));
  let ladder = createLadder(2);
  while (!ladder.done) ladder = submitRung(ladder, nextRung(ladder)).ladder;
  assert.equal(hintFor(ladder), '');
});

test('ladder: stars by mistakes, and a bad table is refused', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(ladderStars), [3, 2, 2, 1, 1]);
  assert.equal(codeOf(() => createLadder(0)), 'BAD_FLOOR');
  assert.equal(codeOf(() => createLadder(31)), 'BAD_FLOOR');
});

// ---- remembering facts ------------------------------------------------------------------------

test('dayNumber: the same calendar day in the player\'s own time zone gives the same number', () => {
  const morning = new Date(2026, 10, 4, 6, 30);
  const night = new Date(2026, 10, 4, 23, 45);
  const tomorrow = new Date(2026, 10, 5, 0, 5);
  assert.equal(dayNumber(morning), dayNumber(night));
  assert.equal(dayNumber(tomorrow), dayNumber(morning) + 1);
});

test('memory: right answers move a fact up a box and push its next day out; a wrong one drops it to box 0', () => {
  const today = 100;
  let record = recordAnswer(undefined, true, today);
  assert.deepEqual(record, { box: 1, seen: 1, right: 1, due: today + BOX_DAYS[1] });
  record = recordAnswer(record, true, today + 1);
  assert.deepEqual(record, { box: 2, seen: 2, right: 2, due: today + 1 + BOX_DAYS[2] });
  record = recordAnswer(record, false, today + 5);
  assert.deepEqual(record, { box: 0, seen: 3, right: 2, due: today + 5 }, 'a miss is due straight away');
  for (let i = 0; i < 10; i++) record = recordAnswer(record, true, today + 10);
  assert.equal(record.box, MAX_BOX);
  assert.equal(record.due, today + 10 + BOX_DAYS[MAX_BOX]);
  assert.deepEqual(BOX_DAYS.length, MAX_BOX + 1);
  assert.ok(BOX_DAYS.every((d, i) => i === 0 || d > BOX_DAYS[i - 1]), 'higher boxes wait longer');
});

test('memory: a first miss on a new fact is recorded too', () => {
  assert.deepEqual(recordAnswer(undefined, false, 7), { box: 0, seen: 1, right: 0, due: 7 });
});

test('applyResults: updates only the facts asked and leaves the old memory alone', () => {
  const before = { '6x7': { box: 3, seen: 5, right: 5, due: 50 } };
  const after = applyResults(before, [{ key: '6x7', correct: false }, { key: '2x17', correct: true }], 60);
  assert.deepEqual(after['6x7'], { box: 0, seen: 6, right: 5, due: 60 });
  assert.deepEqual(after['2x17'], { box: 1, seen: 1, right: 1, due: 61 });
  assert.deepEqual(before, { '6x7': { box: 3, seen: 5, right: 5, due: 50 } });
});

test('memory: a fact is due on or after its day, and never-seen facts are not "due"', () => {
  assert.equal(isDue({ box: 2, seen: 1, right: 1, due: 10 }, 10), true);
  assert.equal(isDue({ box: 2, seen: 1, right: 1, due: 10 }, 9), false);
  assert.equal(isDue(undefined, 10), false);
});

test('memory: weak facts weigh most, mastered facts least, and a fact never asked is in between', () => {
  const weights = Array.from({ length: MAX_BOX + 1 }, (_, box) => weightOf({ box, seen: 1, right: 1, due: 0 }));
  assert.deepEqual(weights, [11, 9, 7, 5, 3, 1]);
  assert.equal(weightOf(undefined), UNSEEN_WEIGHT);
  assert.ok(weightOf({ box: 0, seen: 1, right: 0, due: 0 }) > UNSEEN_WEIGHT && UNSEEN_WEIGHT > weightOf({ box: 5, seen: 9, right: 9, due: 0 }));
});

test('memory: due facts come weakest first, then the longest overdue', () => {
  const memory = {
    '3x4': { box: 3, seen: 4, right: 4, due: 90 },
    '6x7': { box: 0, seen: 2, right: 0, due: 99 },
    '2x17': { box: 0, seen: 2, right: 1, due: 95 },
    '5x9': { box: 2, seen: 3, right: 3, due: 101 },
  };
  assert.deepEqual(dueKeys(memory, 100), ['2x17', '6x7', '3x4']);
  assert.deepEqual(dueKeys(memory, 101), ['2x17', '6x7', '3x4', '5x9'].sort((a, b) => memory[a].box - memory[b].box || memory[a].due - memory[b].due), 'on day 101 the 5x9 fact is due too, in box 2');
  assert.deepEqual(dueKeys({}, 100), []);
});

test('sanitizeMemory: damaged entries are dropped one at a time and named in the log', () => {
  const logged = [];
  const good = { box: 2, seen: 3, right: 2, due: 40 };
  const memory = sanitizeMemory({
    '6x7': good,
    '7x6': good, // not a fact key (smaller first)
    '2x17': { box: 9, seen: 3, right: 2, due: 40 },
    '3x4': { box: 1, seen: 2, right: 3, due: 40 },
    '5x5': { box: 1, seen: 2, right: 1, due: -1 },
    '8x8': 'oops',
    '9x9': { box: 1.5, seen: 2, right: 1, due: 5 },
    '4x4': { ...good, extra: 'ignored' },
  }, { error: (...args) => logged.push(args) });
  assert.deepEqual(Object.keys(memory).sort(), ['4x4', '6x7']);
  assert.deepEqual(memory['4x4'], good, 'only the known fields are kept');
  assert.equal(logged.length, 6);
  assert.ok(logged.every(([message]) => /table-tower/.test(message)));
  assert.ok(logged.some(([message]) => message.includes('"7x6"')));
});

test('sanitizeMemory: nothing saved is fine; something that is not an object starts again', () => {
  assert.deepEqual(sanitizeMemory(undefined, quiet), {});
  assert.deepEqual(sanitizeMemory(null, quiet), {});
  const logged = [];
  for (const bad of ['text', 5, [1, 2], true]) assert.deepEqual(sanitizeMemory(bad, { error: (...a) => logged.push(a) }), {});
  assert.equal(logged.length, 4);
});

// ---- choosing questions -----------------------------------------------------------------------

test('pickWeighted: distinct picks, never more than there are, and heavier items come up more often', () => {
  const rng = createRng(3);
  const items = ['a', 'b', 'c', 'd'];
  const picks = pickWeighted(items, () => 1, 3, rng);
  assert.equal(new Set(picks).size, 3);
  assert.equal(pickWeighted(items, () => 1, 10, rng).length, 4);
  assert.deepEqual(pickWeighted([], () => 1, 3, rng), []);
  let heavyFirst = 0;
  for (let i = 0; i < 2000; i++) if (pickWeighted(['heavy', 'light'], (x) => (x === 'heavy' ? 9 : 1), 1, rng)[0] === 'heavy') heavyFirst++;
  assert.ok(heavyFirst > 1650 && heavyFirst < 1950, `heavy first ${heavyFirst} of 2000`);
});

test('buildChallenge: all ten facts of the floor and two to review from floors cleared before', () => {
  const level = LEVELS.medium;
  for (let seed = 1; seed < 40; seed++) {
    const qs = buildChallenge({ floor: 13, level, memory: {}, clearedBefore: [11, 12], rng: createRng(seed) });
    assert.equal(qs.length, 12);
    const own = new Set(factsForFloor(13).map((f) => f.key));
    const ownAsked = qs.filter((q) => own.has(q.key));
    assert.equal(new Set(ownAsked.map((q) => q.key)).size, 10, 'every fact of the floor is asked');
    const review = qs.filter((q) => !own.has(q.key));
    assert.equal(review.length, REVIEW_QUESTIONS);
    for (const q of review) assert.ok(factsForFloor(11).concat(factsForFloor(12)).some((f) => f.key === q.key), 'from a floor cleared before');
    assert.ok(qs.every((q) => q.hide === 'product' && Number.isInteger(q.answer)));
  }
});

test('buildChallenge: with nothing cleared before, the weakest facts of the floor come round again', () => {
  const memory = { '3x7': { box: 0, seen: 3, right: 0, due: 0 }, '3x8': { box: 0, seen: 3, right: 0, due: 0 } };
  let weakAgain = 0;
  for (let seed = 1; seed < 60; seed++) {
    const qs = buildChallenge({ floor: 3, level: LEVELS.easy, memory, clearedBefore: [], rng: createRng(seed) });
    assert.equal(qs.length, 12);
    weakAgain += qs.filter((q) => q.key === '3x7' || q.key === '3x8').length;
  }
  assert.ok(weakAgain / 59 > 2.5, `weak facts per challenge ${weakAgain / 59}`);
});

test('buildChallenge: weak facts from earlier floors are the ones reviewed', () => {
  const memory = {};
  for (const fact of factsForFloor(11)) memory[fact.key] = { box: 5, seen: 9, right: 9, due: 999 };
  memory['2x11'] = { box: 0, seen: 4, right: 0, due: 0 };
  memory['3x11'] = { box: 0, seen: 4, right: 0, due: 0 };
  let weak = 0;
  for (let seed = 1; seed < 100; seed++) {
    const qs = buildChallenge({ floor: 12, level: LEVELS.medium, memory, clearedBefore: [11], rng: createRng(seed) });
    weak += qs.filter((q) => q.key === '2x11' || q.key === '3x11').length;
  }
  assert.ok(weak > 120, `the two weak facts came up ${weak} times in 100 challenges (of 200 review slots)`);
});

test('buildChallenge: hard sometimes hides the multiplier, easy never', () => {
  let hidden = 0;
  for (let seed = 1; seed < 40; seed++) hidden += buildChallenge({ floor: 25, level: LEVELS.hard, memory: {}, clearedBefore: [], rng: createRng(seed) }).filter((q) => q.hide === 'multiplier').length;
  assert.ok(hidden > 60 && hidden < 200, `hidden ${hidden} of 480`);
  for (let seed = 1; seed < 20; seed++) assert.ok(buildChallenge({ floor: 5, level: LEVELS.easy, memory: {}, clearedBefore: [], rng: createRng(seed) }).every((q) => q.hide === 'product'));
});

test('buildRevision: due facts first, weakest first; then other facts already met; never a fact not yet seen', () => {
  const memory = {
    '3x4': { box: 4, seen: 8, right: 8, due: 500 },
    '6x7': { box: 0, seen: 2, right: 0, due: 99 },
    '2x17': { box: 1, seen: 2, right: 1, due: 100 },
    '5x9': { box: 3, seen: 3, right: 3, due: 120 },
  };
  const qs = buildRevision({ level: LEVELS.medium, memory, today: 100, rng: createRng(2), count: 2 });
  assert.deepEqual(qs.map((q) => q.key).sort(), ['2x17', '6x7']);
  const all = buildRevision({ level: LEVELS.medium, memory, today: 100, rng: createRng(2) });
  assert.deepEqual(all.map((q) => q.key).sort(), ['2x17', '3x4', '5x9', '6x7'], 'only the four it has met, even though ten were wanted');
  assert.ok(all.length <= REVISION_QUESTIONS);
  assert.deepEqual(buildRevision({ level: LEVELS.easy, memory: {}, today: 100, rng: createRng(2) }), [], 'nothing to revise yet');
});

test('buildRevision: a fact that is on two floors is asked with either one as the table', () => {
  const memory = { '6x7': { box: 0, seen: 1, right: 0, due: 0 } };
  const tables = new Set();
  for (let seed = 1; seed < 30; seed++) tables.add(buildRevision({ level: LEVELS.easy, memory, today: 1, rng: createRng(seed) })[0].table);
  assert.deepEqual([...tables].sort(), [6, 7]);
});

// ---- a run of questions -----------------------------------------------------------------------

const questionsFor = (floor, count = 4, rng = createRng(1)) => factsForFloor(floor).slice(0, count).map((fact) => makeQuestion({ fact, floor, rng }));

test('QuizSession: answer, then advance, one question at a time', () => {
  const qs = questionsFor(7, 3);
  const session = new QuizSession({ questions: qs });
  assert.equal(session.total, 3);
  assert.equal(session.position, 1);
  assert.equal(session.current, qs[0]);
  const first = session.answer(qs[0].answer);
  assert.deepEqual({ correct: first.correct, expected: first.expected, repeat: first.repeat }, { correct: true, expected: 7, repeat: false });
  assert.equal(session.answer(1), null, 'a second answer to the same question is ignored until advance');
  assert.equal(session.current, qs[0], 'it stays until advance');
  assert.equal(session.position, 1);
  session.advance();
  assert.equal(session.current, qs[1]);
  assert.equal(session.position, 2);
  session.advance();
  assert.equal(session.current, qs[1], 'advance does nothing before an answer');
  session.answer(0);
  session.advance();
  session.answer(qs[2].answer);
  session.advance();
  assert.equal(session.over, true);
  assert.equal(session.current, null);
  assert.equal(session.position, 3);
  assert.equal(session.answer(1), null);
  const summary = session.summary();
  assert.deepEqual({ total: summary.total, correct: summary.correct, answered: summary.answered, unanswered: summary.unanswered, timedOut: summary.timedOut }, { total: 3, correct: 2, answered: 3, unanswered: 0, timedOut: false });
  assert.deepEqual(summary.firstResults, [{ key: qs[0].key, correct: true }, { key: qs[1].key, correct: false }, { key: qs[2].key, correct: true }]);
  assert.deepEqual(summary.missed.map((q) => q.key), [qs[1].key]);
});

test('QuizSession: a quiz needs questions', () => {
  assert.equal(codeOf(() => new QuizSession({ questions: [] })), 'NO_QUESTIONS');
});

test('QuizSession: without requeue a wrong answer is just counted (a Challenge is a test)', () => {
  const qs = questionsFor(7, 3);
  const session = new QuizSession({ questions: qs });
  session.answer(0);
  session.advance();
  assert.equal(session.current, qs[1]);
  assert.equal(session.summary().total, 3);
});

test('QuizSession with requeue: a missed question returns after three others, at most twice, and counts once', () => {
  const qs = questionsFor(9, 6);
  const session = new QuizSession({ questions: qs, requeue: true });
  const order = [];
  let guard = 0;
  while (!session.over && guard++ < 40) {
    const q = session.current;
    order.push(q.key);
    // The first question is always wrong, everything else right.
    const wrong = q.key === qs[0].key;
    session.answer(wrong ? -1 : q.answer);
    session.advance();
  }
  const first = qs[0].key;
  const places = order.map((key, i) => (key === first ? i : -1)).filter((i) => i >= 0);
  assert.equal(places.length, 1 + MAX_REQUEUES, 'asked once and put back twice');
  assert.equal(places[1], 1 + REQUEUE_GAP, 'back after three others');
  assert.ok(places[2] - places[1] >= 3, 'and again after the next few (or at the end, when fewer than three are left)');
  assert.equal(places[2], order.length - 1, 'the second return was the end of the queue');
  const summary = session.summary();
  assert.equal(summary.total, 6, 'the repeats are not extra questions');
  assert.equal(summary.answered, 6);
  assert.equal(summary.correct, 5, 'only the first answer to each question counts');
  assert.deepEqual(summary.firstResults.filter((r) => r.key === first), [{ key: first, correct: false }]);
});

test('QuizSession: a repeat of a question is marked, so it does not count in memory', () => {
  const qs = questionsFor(4, 2);
  const session = new QuizSession({ questions: qs, requeue: true });
  session.answer(-1);
  session.advance();
  session.answer(qs[1].answer);
  session.advance();
  const second = session.current;
  assert.equal(second.key, qs[0].key);
  assert.equal(session.answer(second.answer).repeat, true);
});

test('QuizSession: a fact asked twice in a Challenge counts both times, and memory hears the first answer once', () => {
  const [q] = questionsFor(3, 1);
  const session = new QuizSession({ questions: [q, q, q] });
  session.answer(q.answer);
  session.advance();
  session.answer(-1);
  session.advance();
  session.answer(q.answer);
  session.advance();
  const summary = session.summary();
  assert.deepEqual({ total: summary.total, correct: summary.correct, answered: summary.answered }, { total: 3, correct: 2, answered: 3 });
  assert.deepEqual(summary.firstResults, [{ key: q.key, correct: true }], 'one entry for the fact, from its first answer');
  assert.deepEqual(summary.missed.map((m) => m.key), [q.key], 'listed once');
  assert.equal(quizStars(summary), 1);
});

test('a Challenge with nothing cleared before can still earn 3 stars: the repeated facts are scored', () => {
  const questions = buildChallenge({ floor: 1, level: LEVELS.easy, memory: {}, clearedBefore: [], rng: createRng(4) });
  const session = new QuizSession({ questions, seconds: 96 });
  while (!session.over) {
    session.answer(session.current.answer);
    session.advance();
  }
  const summary = session.summary();
  assert.equal(summary.correct, 12);
  assert.equal(quizStars(summary), 3);
});

test('QuizSession: the position counts the questions reached, not the repeats', () => {
  const qs = questionsFor(4, 3);
  const session = new QuizSession({ questions: qs, requeue: true });
  const positions = [];
  while (!session.over) {
    positions.push(session.position);
    session.answer(session.position === 1 && positions.length === 1 ? -1 : session.current.answer);
    session.advance();
  }
  assert.ok(positions.every((p) => p >= 1 && p <= 3));
  assert.equal(Math.max(...positions), 3);
});

test('QuizSession: the clock counts down only when asked and ends the run at zero; what was not answered counts wrong', () => {
  const qs = questionsFor(5, 4);
  const session = new QuizSession({ questions: qs, seconds: 10 });
  assert.equal(session.secondsLeft, 10);
  assert.equal(session.tick(3), false);
  assert.equal(session.secondsLeft, 7);
  session.answer(qs[0].answer);
  session.advance();
  assert.equal(session.tick(7.5), true, 'the moment it runs out');
  assert.equal(session.secondsLeft, 0);
  assert.equal(session.over, true);
  assert.equal(session.tick(1), false, 'no more once it is over');
  const summary = session.summary();
  assert.deepEqual({ total: summary.total, correct: summary.correct, answered: summary.answered, unanswered: summary.unanswered, timedOut: summary.timedOut }, { total: 4, correct: 1, answered: 1, unanswered: 3, timedOut: true });
  assert.equal(quizStars(summary), 1);
  assert.equal(new QuizSession({ questions: qs }).secondsLeft, null);
  assert.equal(new QuizSession({ questions: qs }).tick(5), false, 'no limit, no timeout');
});

// ---- stars and score --------------------------------------------------------------------------

test('quizStars: 90% or more is 3, 70% or more is 2, otherwise 1; unanswered counts wrong', () => {
  assert.deepEqual([[12, 12], [11, 12], [10, 12], [9, 12], [8, 12], [3, 12], [0, 12]].map(([correct, total]) => quizStars({ correct, total })), [3, 3, 2, 2, 1, 1, 1]);
  assert.equal(quizStars({ correct: 9, total: 12 }), CLEAR_STARS, 'nine of twelve clears a floor');
  assert.equal(quizStars({ correct: 0, total: 0 }), 1);
});

test('challengeScore: 10 a right answer and a point for each whole second left', () => {
  assert.equal(challengeScore({ correct: 12, secondsLeft: 40.9 }), 160);
  assert.equal(challengeScore({ correct: 0, secondsLeft: -3 }), 0);
});
