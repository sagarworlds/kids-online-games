import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recommendLevel } from '../../src/engine/utils/recommendLevel.js';
import { LEVEL_IDS, MODE_IDS, levelKey, starsAtLevel } from '../../src/games/planet-hop/logic/levels.js';

test('Planet Hop: the best of the three ways to play counts, level by level', () => {
  const bestStars = { [levelKey(MODE_IDS[0], 'easy')]: 2, [levelKey(MODE_IDS[1], 'easy')]: 3, [levelKey(MODE_IDS[2], 'medium')]: 1 };
  assert.deepEqual(LEVEL_IDS.map((level) => starsAtLevel(bestStars, level)), [3, 1, 0]);
  assert.deepEqual(LEVEL_IDS.map((level) => starsAtLevel({}, level)), [0, 0, 0], 'nothing saved, nothing at any level');
});

test('Planet Hop: the stars a mode saved decide the level the menu opens on', () => {
  const at = (bestStars) => recommendLevel(LEVEL_IDS, (level) => starsAtLevel(bestStars, level));
  assert.equal(at({}), 'easy');
  assert.equal(at({ [levelKey(MODE_IDS[1], 'easy')]: 3 }), 'medium');
  assert.equal(at({ [levelKey(MODE_IDS[0], 'easy')]: 3, [levelKey(MODE_IDS[2], 'medium')]: 3 }), 'hard');
});
