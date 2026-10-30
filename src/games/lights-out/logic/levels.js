import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{ id: 'easy'|'medium'|'hard', label: string, blurb: string, size: number, minTaps: number, maxTaps: number }} LevelConfig
 * `minTaps`..`maxTaps` is how many random taps scramble a puzzle, which is also its par.
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: '3 × 3 jars', size: 3, minTaps: 2, maxTaps: 3 }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: '4 × 4 jars', size: 4, minTaps: 4, maxTaps: 6 }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: '5 × 5 jars', size: 5, minTaps: 7, maxTaps: 10 }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
export const PUZZLES_PER_ROUND = 5;

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
