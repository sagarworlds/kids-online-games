import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recommendLevel } from '../../src/engine/utils/recommendLevel.js';
import { LEVELS, LEVEL_IDS, roundKey, starsAtLevel } from '../../src/games/trace-trail/logic/levels.js';

test('Trace Trail: the best of a level\'s sets counts at that level, and a set of another level does not', () => {
  const [first] = LEVELS.easy.setIds;
  const [second] = LEVELS.medium.setIds;
  const bestStars = { [roundKey(first)]: 3, [roundKey(second)]: 1 };
  assert.deepEqual(LEVEL_IDS.map((level) => starsAtLevel(bestStars, level)), [3, 1, 0]);
  assert.equal(starsAtLevel({}, 'easy'), 0);
});

test('Trace Trail: numbers traced well open the menu on the letters', () => {
  const bestStars = { [roundKey(LEVELS.easy.setIds[1])]: 2 };
  assert.equal(recommendLevel(LEVEL_IDS, (level) => starsAtLevel(bestStars, level)), 'medium');
});
