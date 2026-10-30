import { GameError } from '../../../engine/utils/errors.js';

/** @typedef {{ id: 'easy'|'medium'|'hard', label: string, blurb: string }} LevelConfig */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'Repeating shapes, growing groups, adding' }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'Adds subtracting, doubling, two changes at once' }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Gaps in the middle, turning arrows, tricky jumps' }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
export const CASES_PER_ROUND = 10;
/** Numbers in a case stay between 0 and this. */
export const MAX_NUMBER = 200;
/** Cases solved on the first pick for 3 and 2 stars. */
export const THREE_STARS_AT = 9;
export const TWO_STARS_AT = 6;

/**
 * @param {string} id
 * @returns {Readonly<LevelConfig>}
 * @throws {GameError} 'UNKNOWN_LEVEL'
 */
export function getLevel(id) {
  const level = LEVELS[id];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `Unknown level "${id}"`, { id });
  return level;
}
