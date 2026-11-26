import { test } from 'node:test';
import assert from 'node:assert/strict';

import { READY_STARS, recommendLevel, startingLevel, starsByLevel } from '../../src/engine/utils/recommendLevel.js';

const LEVELS = ['easy', 'medium', 'hard'];
/** A child's best stars as a lookup: levels not named have none. */
const stars = (best) => (level) => best[level] ?? 0;

test('a child who has done nothing starts on the first level', () => {
  assert.equal(recommendLevel(LEVELS, stars({})), 'easy');
});

test('two stars or more on a level, and the next one is offered', () => {
  assert.equal(READY_STARS, 2);
  assert.equal(recommendLevel(LEVELS, stars({ easy: 2 })), 'medium');
  assert.equal(recommendLevel(LEVELS, stars({ easy: 3 })), 'medium');
  assert.equal(recommendLevel(LEVELS, stars({ easy: 3, medium: 2 })), 'hard');
});

test('one star is not enough to move on: the child stays on that level', () => {
  assert.equal(recommendLevel(LEVELS, stars({ easy: 1 })), 'easy');
  assert.equal(recommendLevel(LEVELS, stars({ easy: 3, medium: 1 })), 'medium');
});

test('a child who skipped ahead is offered the level after the highest one done well, not the first', () => {
  assert.equal(recommendLevel(LEVELS, stars({ medium: 3 })), 'hard');
  assert.equal(recommendLevel(LEVELS, stars({ easy: 1, medium: 2 })), 'hard');
});

test('a child who did well on the last level stays on it', () => {
  assert.equal(recommendLevel(LEVELS, stars({ easy: 3, medium: 3, hard: 3 })), 'hard');
  assert.equal(recommendLevel(LEVELS, stars({ hard: 2 })), 'hard');
});

test('the bar can be raised, and the list can be any length', () => {
  assert.equal(recommendLevel(LEVELS, stars({ easy: 2 }), { ready: 3 }), 'easy');
  assert.equal(recommendLevel(LEVELS, stars({ easy: 3 }), { ready: 3 }), 'medium');
  assert.equal(recommendLevel(['only'], stars({ only: 3 })), 'only');
  assert.equal(recommendLevel(['a', 'b'], stars({ a: 2 })), 'b');
});

test('an empty list of levels is a clear error', () => {
  assert.throws(() => recommendLevel([], stars({})), { code: 'BAD_LEVELS' });
  assert.throws(() => startingLevel({ levels: [], starsAt: stars({}) }), { code: 'BAD_LEVELS' });
});

test('a menu opens on the recommended level and points it out only when it is not the first', () => {
  assert.deepEqual(startingLevel({ levels: LEVELS, starsAt: stars({}) }), { level: 'easy', suggested: null }, 'a new child: nothing to point out');
  assert.deepEqual(startingLevel({ levels: LEVELS, starsAt: stars({ easy: 1 }) }), { level: 'easy', suggested: null }, 'still on the first level');
  assert.deepEqual(startingLevel({ levels: LEVELS, starsAt: stars({ easy: 3 }) }), { level: 'medium', suggested: 'medium' });
  assert.deepEqual(startingLevel({ levels: LEVELS, starsAt: stars({ easy: 3, medium: 3 }) }), { level: 'hard', suggested: 'hard' });
});

test('a grown-up\'s lock decides: that level, and nothing suggested', () => {
  assert.deepEqual(startingLevel({ lock: 'easy', levels: LEVELS, starsAt: stars({ easy: 3, medium: 3 }) }), { level: 'easy', suggested: null });
  assert.deepEqual(startingLevel({ lock: 'hard', levels: LEVELS, starsAt: stars({}) }), { level: 'hard', suggested: null });
});

test('starsByLevel reads a save that is keyed by the level id, and says none for a level with nothing', () => {
  const starsAt = starsByLevel({ easy: 3, medium: 1 });
  assert.deepEqual(LEVELS.map(starsAt), [3, 1, 0]);
  assert.equal(recommendLevel(LEVELS, starsAt), 'medium', 'Easy done well, Medium at one star');
});
