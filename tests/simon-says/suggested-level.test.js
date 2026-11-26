import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recommendLevel } from '../../src/engine/utils/recommendLevel.js';
import { LEVEL_IDS, saveKey, starsAtLevel } from '../../src/games/simon-says/logic/levels.js';

test('Simon Says: the classic game and reverse both count at their level', () => {
  const bestStars = { [saveKey('easy', 'classic')]: 1, [saveKey('easy', 'reverse')]: 3, [saveKey('medium', 'classic')]: 2 };
  assert.deepEqual(LEVEL_IDS.map((level) => starsAtLevel(bestStars, level)), [3, 2, 0]);
  assert.equal(starsAtLevel({}, 'easy'), 0);
});

test('Simon Says: doing well in reverse alone moves the menu on', () => {
  const bestStars = { [saveKey('easy', 'reverse')]: 2 };
  assert.equal(recommendLevel(LEVEL_IDS, (level) => starsAtLevel(bestStars, level)), 'medium');
});
