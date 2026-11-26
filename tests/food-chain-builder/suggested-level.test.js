import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recommendLevel } from '../../src/engine/utils/recommendLevel.js';
import { starsAtLevel } from '../../src/games/food-chain-builder/logic/habitats.js';

const LEVELS = ['easy', 'medium', 'hard'];
const HABITATS = LEVELS.flatMap((level) => ['forest', 'ocean'].map((place) => ({ id: `${place}-${level}`, place, level })));

test('Food Chain Builder: the best habitat at a level counts, found by the habitat id the stars are saved under', () => {
  const bestStars = { 'forest-easy': 2, 'ocean-easy': 3, 'ocean-hard': 1 };
  assert.deepEqual(LEVELS.map((level) => starsAtLevel(bestStars, level, HABITATS)), [3, 0, 1]);
  assert.equal(starsAtLevel({}, 'easy', HABITATS), 0);
});

test('Food Chain Builder: a forest done well on Easy opens the menu on Medium', () => {
  assert.equal(recommendLevel(LEVELS, (level) => starsAtLevel({ 'forest-easy': 2 }, level, HABITATS)), 'medium');
});
