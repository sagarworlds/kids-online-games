import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recommendLevel } from '../../src/engine/utils/recommendLevel.js';
import { LEVEL_IDS, roundKey, starsAtLevel } from '../../src/games/matra-mixer/logic/levels.js';

const ACTIVITIES = ['build', 'bubbles', 'words'];

test('Matra Mixer: the best activity at a level counts, in the language chosen', () => {
  const bestStars = { [roundKey('build', 'hi', 'easy')]: 3, [roundKey('words', 'hi', 'medium')]: 1, [roundKey('bubbles', 'mr', 'easy')]: 1 };
  assert.deepEqual(LEVEL_IDS.map((level) => starsAtLevel(bestStars, level, 'hi', ACTIVITIES)), [3, 1, 0]);
});

test('Matra Mixer: Hindi and Marathi keep separate bests, so doing well in one does not push the other on', () => {
  const bestStars = { [roundKey('build', 'hi', 'easy')]: 3 };
  const at = (lang) => recommendLevel(LEVEL_IDS, (level) => starsAtLevel(bestStars, level, lang, ACTIVITIES));
  assert.equal(at('hi'), 'medium');
  assert.equal(at('mr'), 'easy');
});
