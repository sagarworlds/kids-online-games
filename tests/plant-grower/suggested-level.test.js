import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recommendLevel } from '../../src/engine/utils/recommendLevel.js';
import { LEVEL_IDS, roundKey, starsAtLevel } from '../../src/games/plant-grower/logic/levels.js';

const PLANTS = ['sunflower', 'tomato', 'rice'];

test('Plant Grower: the best of any plant at a level counts, and a plant at another level does not', () => {
  const bestStars = { [roundKey('sunflower', 'easy')]: 2, [roundKey('tomato', 'easy')]: 3, [roundKey('rice', 'hard')]: 1 };
  assert.deepEqual(LEVEL_IDS.map((level) => starsAtLevel(bestStars, level, PLANTS)), [3, 0, 1]);
  assert.equal(starsAtLevel({}, 'easy', PLANTS), 0);
  assert.equal(starsAtLevel(bestStars, 'easy', []), 0, 'a game with no plants has nothing to count');
});

test('Plant Grower: a sunflower grown well on Easy opens the menu on Medium', () => {
  const bestStars = { [roundKey('sunflower', 'easy')]: 2 };
  assert.equal(recommendLevel(LEVEL_IDS, (level) => starsAtLevel(bestStars, level, PLANTS)), 'medium');
});
