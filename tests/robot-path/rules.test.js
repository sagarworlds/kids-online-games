import { test } from 'node:test';
import assert from 'node:assert/strict';

import { starsFor, criteriaFor } from '../../src/games/robot-path/logic/scoring.js';
import { levelStatus, nextLevelId, worldForLock, summarise } from '../../src/games/robot-path/logic/progress.js';
import { describeOutcome, hintAfterFailures } from '../../src/games/robot-path/logic/messages.js';
import { levelKey } from '../../src/games/robot-path/logic/levels.js';

// ---- stars -----------------------------------------------------------------

const result = (over) => ({ reachedGoal: true, blocks: 5, par: 5, collected: 0, totalGems: 0, ...over });

test('stars: goal = 1, within par = +1, all gems = +1', () => {
  assert.equal(starsFor(result({ reachedGoal: false })), 0);
  // World 3 style level with gems:
  assert.equal(starsFor(result({ blocks: 9, totalGems: 2, collected: 0 })), 1, 'goal only');
  assert.equal(starsFor(result({ blocks: 5, totalGems: 2, collected: 0 })), 2, 'goal + par');
  assert.equal(starsFor(result({ blocks: 9, totalGems: 2, collected: 2 })), 2, 'goal + gems');
  assert.equal(starsFor(result({ blocks: 5, totalGems: 2, collected: 2 })), 3);
  assert.equal(starsFor(result({ blocks: 5, totalGems: 2, collected: 1 })), 2, 'a missing gem loses the star');
});

test('on levels without gems the gem star is automatic: 2 stars for solving, 3 within par', () => {
  assert.equal(starsFor(result({ blocks: 9, par: 5 })), 2, 'over par: goal + (nothing left to collect)');
  assert.equal(starsFor(result({ blocks: 5, par: 5 })), 3, 'within par');
  assert.equal(starsFor(result({ blocks: 3, par: 5 })), 3, 'beating par still counts');
});

test('criteria say which stars were met and which apply', () => {
  const c = criteriaFor(result({ blocks: 9, totalGems: 3, collected: 3 }));
  assert.deepEqual(c.map((x) => [x.id, x.met, x.applicable]), [['goal', true, true], ['par', false, true], ['gems', true, true]]);
  const noGems = criteriaFor(result({}));
  assert.equal(noGems.find((x) => x.id === 'gems').applicable, false);
});

// ---- unlocking -------------------------------------------------------------

const levels = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, world: Math.floor(i / 10) + 1 }));

test('level 1 is open; a level opens once the one before it has a star', () => {
  assert.equal(levelStatus(levels, 1, {}), 'open');
  assert.equal(levelStatus(levels, 2, {}), 'locked');
  assert.equal(levelStatus(levels, 2, { [levelKey(1)]: 1 }), 'open');
  assert.equal(levelStatus(levels, 3, { [levelKey(1)]: 3 }), 'locked', 'only the next level opens');
  assert.equal(levelStatus(levels, 99, {}), 'locked', 'unknown level');
});

test('world 2 starts after the last level of world 1', () => {
  assert.equal(levelStatus(levels, 11, {}), 'locked');
  assert.equal(levelStatus(levels, 11, { [levelKey(10)]: 2 }), 'open');
});

test('a difficulty lock plays one world only, and its first level is always open', () => {
  assert.deepEqual(['easy', 'medium', 'hard', null].map(worldForLock), [1, 2, 3, null]);
  assert.equal(levelStatus(levels, 11, {}, 2), 'open', 'first level of the locked world');
  assert.equal(levelStatus(levels, 12, {}, 2), 'locked');
  assert.equal(levelStatus(levels, 12, { [levelKey(11)]: 1 }, 2), 'open');
  assert.equal(levelStatus(levels, 3, { [levelKey(2)]: 3 }, 2), 'grown-up-locked');
});

test('nextLevelId follows the order, stops at the end and at a locked world\'s edge', () => {
  assert.equal(nextLevelId(levels, 4), 5);
  assert.equal(nextLevelId(levels, 30), null);
  assert.equal(nextLevelId(levels, 10), 11);
  assert.equal(nextLevelId(levels, 10, 1), null, 'world 1 is locked in, so no level 11');
  assert.equal(nextLevelId(levels, 11, 2), 12);
});

test('summarise totals stars and completed levels', () => {
  const s = summarise(levels, { [levelKey(1)]: 3, [levelKey(2)]: 2, [levelKey(5)]: 1 });
  assert.deepEqual(s, { stars: 6, maxStars: 90, completed: 3 });
});

// ---- messages --------------------------------------------------------------

test('outcome messages are friendly and name the step', () => {
  const wall = { status: 'crashed', crash: { kind: 'wall', step: 4 } };
  const edge = { status: 'crashed', crash: { kind: 'edge', step: 2 } };
  assert.equal(describeOutcome(wall).text, 'Robot hit a wall at step 4');
  assert.equal(describeOutcome(edge).text, 'Robot drove off the edge at step 2');
  assert.equal(describeOutcome({ status: 'too-many-steps' }).text, 'Too many steps!');
  assert.equal(describeOutcome({ status: 'empty' }).text, 'Add some blocks first');
  assert.equal(describeOutcome({ status: 'success' }).tone, 'good');
  assert.equal(describeOutcome({ status: 'missed-goal' }).tone, 'bad');
});

test('hints combine the level tip with advice for what went wrong', () => {
  const level = { tip: 'Turn Left is the robot\'s left.' };
  assert.match(hintAfterFailures(level, { status: 'crashed' }), /^Turn Left is the robot's left\. Use Step/);
  assert.match(hintAfterFailures({ tip: '' }, { status: 'missed-goal' }), /^Count the squares/);
  assert.match(hintAfterFailures(level, { status: 'too-many-steps' }), /Repeat/);
});
