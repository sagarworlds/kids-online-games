import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recommendLevel } from '../../src/engine/utils/recommendLevel.js';
import { LEVEL_IDS, roundKey, starsAtLevel } from '../../src/games/spot-the-difference/logic/levels.js';

const THEMES = ['farm', 'beach', 'mix'];

test('Spot the Difference: the best of any theme, the mix included, counts at its level', () => {
  const bestStars = { [roundKey('farm', 'easy')]: 1, [roundKey('mix', 'easy')]: 2, [roundKey('beach', 'medium')]: 3 };
  assert.deepEqual(LEVEL_IDS.map((level) => starsAtLevel(bestStars, level, THEMES)), [2, 3, 0]);
  assert.equal(starsAtLevel({}, 'hard', THEMES), 0);
});

test('Spot the Difference: two stars on a theme at Medium opens the menu on Hard', () => {
  const bestStars = { [roundKey('beach', 'medium')]: 2 };
  assert.equal(recommendLevel(LEVEL_IDS, (level) => starsAtLevel(bestStars, level, THEMES)), 'hard');
});
