import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NinjaRound, TOTAL_PROBLEMS, START_SHIELDS, SPEEDUP_FACTOR,
} from '../../src/games/number-ninja/logic/round.js';
import { LEVELS } from '../../src/games/number-ninja/logic/levels.js';
import { createRng } from '../../src/engine/utils/random.js';

const TICK = 0.05; // the engine's maximum dt

const newRound = (overrides = {}) =>
  new NinjaRound({ levelId: 'easy', ops: ['+', '-'], rng: createRng(7), ...overrides });

/** Advances time until a star is on screen and returns the first one. */
function waitForStar(round) {
  for (let i = 0; i < 400 && round.problems.length === 0; i++) round.update(TICK);
  assert.ok(round.problems.length > 0, 'a star should have spawned');
  return round.problems[0];
}

/** Plays a round like a perfect child: answers the lowest star the moment it appears. */
function playPerfectly(round, maxTicks = 20000) {
  for (let i = 0; i < maxTicks && !round.finished; i++) {
    round.update(TICK);
    const star = round.problems[0];
    if (star) round.submit(star.answer);
  }
}

// ---- spawning --------------------------------------------------------------

test('the first star appears straight away at the top, in a lane', () => {
  const round = newRound();
  const events = round.update(TICK);
  assert.equal(events[0].type, 'spawn');
  const star = round.problems[0];
  assert.ok(star.y < 0.1);
  assert.ok(star.x > 0 && star.x < 1);
  assert.equal(round.spawned, 1);
});

test('never more stars on screen than the level allows (easy 2, medium 3, hard 3)', () => {
  for (const [levelId, ops, max] of [['easy', ['+', '-'], 2], ['medium', LEVELS.medium.ops, 3], ['hard', LEVELS.hard.ops, 3]]) {
    const round = new NinjaRound({ levelId, ops, rng: createRng(5), totalProblems: 60, shields: 1000 });
    let highest = 0;
    // Nobody answers, so stars pile up to the limit and then land.
    for (let i = 0; i < 4000 && !round.finished; i++) {
      round.update(TICK);
      highest = Math.max(highest, round.problems.length);
      assert.ok(round.problems.length <= max, `${levelId}: ${round.problems.length} on screen`);
    }
    assert.equal(highest, max, `${levelId} reaches its maximum`);
  }
});

test('stars in the top part of the screen never share a lane', () => {
  const round = newRound({ levelId: 'hard', ops: LEVELS.hard.ops, totalProblems: 40, shields: 1000 });
  for (let i = 0; i < 4000 && !round.finished; i++) {
    round.update(TICK);
    const high = round.problems.filter((s) => s.y < 0.4);
    assert.equal(new Set(high.map((s) => s.lane)).size, high.length);
  }
});

test('stars fall at the speed set by the level (easy: 12 s from top to ground)', () => {
  const round = newRound();
  const star = waitForStar(round);
  assert.ok(Math.abs(star.speed - 1 / 12) < 1e-12);
  const startY = star.y;
  round.update(1);
  assert.ok(Math.abs(star.y - (startY + 1 / 12)) < 1e-9);
});

// ---- answering -------------------------------------------------------------

test('typing the right answer clears the star immediately (within the same call)', () => {
  const round = newRound();
  const star = waitForStar(round);
  const result = round.submit(star.answer);
  assert.equal(result.type, 'hit');
  assert.equal(result.problem.id, star.id);
  assert.ok(!round.problems.some((s) => s.id === star.id), 'star is gone straight away');
  assert.equal(round.correct, 1);
  assert.equal(round.resolved, 1);
});

test('points follow 10 + 2 x streak, capped at 30, and the streak counts up', () => {
  const round = newRound({ totalProblems: 40, shields: 1000 });
  const points = [];
  for (let i = 0; i < 14; i++) {
    const star = waitForStar(round);
    points.push(round.submit(star.answer).points);
  }
  assert.deepEqual(points, [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 30, 30, 30]);
  assert.equal(round.score, points.reduce((a, b) => a + b, 0));
  assert.equal(round.streak, 14);
  assert.equal(round.bestStreak, 14);
});

test('every 5th answer in a row is flagged as a streak milestone', () => {
  const round = newRound({ totalProblems: 40, shields: 1000 });
  const flags = [];
  for (let i = 0; i < 10; i++) flags.push(round.submit(waitForStar(round).answer).milestone);
  assert.deepEqual(flags, [false, false, false, false, true, false, false, false, false, true]);
});

test('a wrong answer costs no shield, resets the streak, and is counted', () => {
  const round = newRound({ totalProblems: 40 });
  round.submit(waitForStar(round).answer);
  round.submit(waitForStar(round).answer);
  assert.equal(round.streak, 2);
  const star = waitForStar(round);
  const wrongValue = star.answer + 1000;
  const result = round.submit(wrongValue);
  assert.equal(result.type, 'wrong');
  assert.equal(round.shields, START_SHIELDS);
  assert.equal(round.streak, 0);
  assert.equal(round.wrong, 1);
  assert.ok(round.problems.some((s) => s.id === star.id), 'the star keeps falling');
  assert.equal(round.bestStreak, 2, 'best streak is remembered');
  // After a reset the next right answer scores 10 again.
  assert.equal(round.submit(star.answer).points, 10);
});

test('a hint appears after two wrong answers in a row, and clears after a right one', () => {
  const round = newRound();
  const star = waitForStar(round);
  const first = round.submit(9999);
  const second = round.submit(9998);
  const third = round.submit(9997);
  assert.equal(first.hint, null);
  assert.equal(typeof second.hint, 'string');
  assert.ok(second.hint.length > 0);
  assert.equal(typeof third.hint, 'string');
  round.submit(star.answer);
  const next = waitForStar(round);
  assert.equal(round.submit(next.answer + 5000).hint, null, 'the wrong-in-a-row count restarted');
});

test('two stars with the same answer: the lower one is cleared first', () => {
  const round = newRound({ levelId: 'medium', ops: ['x'], totalProblems: 200, shields: 1000, rng: createRng(11) });
  let pair = null;
  for (let i = 0; i < 3000 && !pair; i++) {
    round.update(TICK);
    const stars = round.problems;
    for (const a of stars) for (const b of stars) if (a !== b && a.answer === b.answer) pair = [a, b];
    // Keep the screen busy without ever answering.
  }
  assert.ok(pair, 'this seed should put two stars with the same answer on screen');
  const lower = pair[0].y > pair[1].y ? pair[0] : pair[1];
  assert.equal(round.submit(pair[0].answer).problem.id, lower.id);
});

// ---- landing ---------------------------------------------------------------

test('a star that lands costs exactly one shield, resets the streak and reports the star', () => {
  const round = newRound({ totalProblems: 40 });
  round.submit(waitForStar(round).answer);
  assert.equal(round.streak, 1);
  const star = waitForStar(round);
  const landed = [];
  for (let i = 0; i < 1000 && landed.length === 0; i++) {
    for (const e of round.update(TICK)) if (e.type === 'landed') landed.push(e);
  }
  assert.equal(landed.length, 1);
  assert.equal(landed[0].problem.id, star.id);
  assert.equal(landed[0].problem.y, 1);
  assert.equal(landed[0].problem.answer, star.answer, 'the answer is available to display for 1.5 s');
  assert.equal(landed[0].shields, START_SHIELDS - 1);
  assert.equal(round.shields, START_SHIELDS - 1);
  assert.equal(round.streak, 0);
  assert.equal(round.missedCount, 1);
  assert.ok(!round.problems.some((s) => s.id === star.id));
});

// ---- ending ----------------------------------------------------------------

test('the round ends after 20 problems and reports "complete"', () => {
  const round = newRound();
  playPerfectly(round);
  assert.equal(round.finished, true);
  assert.equal(round.endReason, 'complete');
  assert.equal(round.spawned, TOTAL_PROBLEMS);
  assert.equal(round.resolved, TOTAL_PROBLEMS);
  assert.equal(round.correct, TOTAL_PROBLEMS);
  const r = round.results();
  assert.equal(r.accuracy, 1);
  assert.equal(r.stars, 3);
  assert.equal(r.missed, 0);
});

test('the round ends at 0 shields and reports "shields"', () => {
  const round = newRound();
  let end = null;
  for (let i = 0; i < 20000 && !round.finished; i++) {
    for (const e of round.update(TICK)) if (e.type === 'end') end = e;
  }
  assert.deepEqual(end, { type: 'end', reason: 'shields' });
  assert.equal(round.shields, 0);
  assert.equal(round.missedCount, START_SHIELDS);
  assert.equal(round.problems.length, 0, 'remaining stars are cleared');
  assert.equal(round.results().stars, 1, 'still earns a star: no "game over"');
});

test('finishing by answering the last star reports ended: true and stops the round', () => {
  const round = newRound({ totalProblems: 3 });
  let last;
  for (let i = 0; i < 3; i++) last = round.submit(waitForStar(round).answer);
  assert.equal(last.type, 'hit');
  assert.equal(last.ended, true);
  assert.equal(round.finished, true);
  assert.deepEqual(round.update(1), [], 'no events after the end');
  assert.deepEqual(round.submit(1), { type: 'ignored' });
});

test('stars by accuracy: one wrong answer in 20 is still 3 stars; many misses drop it', () => {
  const careful = newRound();
  careful.submit(0); // wrong while nothing (or something) is on screen
  playPerfectly(careful);
  assert.equal(careful.results().wrong >= 1, true);
  assert.equal(careful.results().stars, 3, '20 / 21 = 95%');

  const sloppy = newRound({ totalProblems: 10, shields: 100 });
  for (let i = 0; i < 10; i++) {
    const star = waitForStar(sloppy);
    if (i % 2 === 0) sloppy.submit(star.answer);
    else for (let t = 0; t < 1000 && sloppy.problems.some((s) => s.id === star.id); t++) sloppy.update(TICK);
  }
  assert.equal(sloppy.correct, 5);
  assert.equal(sloppy.missedCount, 5);
  assert.equal(sloppy.results().accuracy, 0.5);
  assert.equal(sloppy.results().stars, 1);
});

// ---- speed-up --------------------------------------------------------------

test('speed rises 5% after every 5 correct answers and never beyond the level maximum', () => {
  const round = newRound({ totalProblems: 400, shields: 1000 });
  const fall = LEVELS.easy.fallTime;
  const times = [round.fallTime];
  for (let i = 1; i <= 120; i++) {
    round.submit(waitForStar(round).answer);
    if (i % 5 === 0) times.push(round.fallTime);
  }
  assert.ok(Math.abs(times[1] - fall.start / SPEEDUP_FACTOR) < 1e-9, '5 correct answers: 5% faster');
  assert.ok(Math.abs(times[2] - fall.start / SPEEDUP_FACTOR ** 2) < 1e-9);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] <= times[i - 1], 'only ever speeds up');
  assert.ok(times.every((t) => t >= fall.min), 'never faster than the level maximum');
  assert.equal(times.at(-1), fall.min, 'and it does reach the cap');
});

test('new stars use the current speed; stars already falling are unchanged', () => {
  const round = newRound({ totalProblems: 100, shields: 1000 });
  const early = waitForStar(round);
  const earlySpeed = early.speed;
  for (let i = 0; i < 5; i++) round.submit(waitForStar(round).answer);
  const later = waitForStar(round);
  assert.equal(early.speed, earlySpeed);
  assert.ok(Math.abs(later.speed - earlySpeed * SPEEDUP_FACTOR) < 1e-9);
});

// ---- results ---------------------------------------------------------------

test('hardest problem is a missed one if any, otherwise the slowest answered', () => {
  const clean = newRound({ totalProblems: 3 });
  // Answer the three stars after 1 s, 4 s and 2 s of waiting.
  const waits = [1, 4, 2];
  let slowest = null;
  for (const wait of waits) {
    const star = waitForStar(clean);
    clean.update(wait);
    if (!slowest || wait > slowest.wait) slowest = { wait, star };
    clean.submit(star.answer);
  }
  const hardest = clean.results().hardest;
  assert.equal(hardest.reason, 'slow');
  assert.equal(hardest.answer, slowest.star.answer);

  const messy = newRound({ totalProblems: 5, shields: 100 });
  const first = waitForStar(messy);
  for (let t = 0; t < 1000 && messy.problems.some((s) => s.id === first.id); t++) messy.update(TICK);
  const result = messy.results().hardest;
  assert.equal(result.reason, 'missed');
  assert.equal(result.answer, first.answer);

  assert.equal(newRound().results().hardest, null, 'nothing played yet');
});

test('the same seed gives the same round', () => {
  const play = (seed) => {
    const round = newRound({ rng: createRng(seed) });
    const keys = [];
    for (let i = 0; i < 20000 && !round.finished; i++) {
      for (const e of round.update(TICK)) if (e.type === 'spawn') keys.push(`${e.problem.a}${e.problem.op}${e.problem.b}@${e.problem.lane}`);
      if (round.problems[0]) round.submit(round.problems[0].answer);
    }
    return keys;
  };
  assert.deepEqual(play(42), play(42));
  assert.notDeepEqual(play(42), play(43));
});

test('an unusable setup fails immediately with a GameError', () => {
  assert.throws(() => newRound({ levelId: 'nope' }), { code: 'UNKNOWN_LEVEL' });
  assert.throws(() => newRound({ ops: ['x'] }), { code: 'NO_OPERATIONS' });
});
