import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, startLength: number, pads: number,
 *   noteMs: number, timeoutSeconds: number, stars: { three: number, two: number }, reverse: boolean
 * }} LevelConfig
 * `stars`: the longest sequence needed for 3 and for 2 stars (any finished round earns 1).
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: '4 pads, 5 s to answer', startLength: 3, pads: 4, noteMs: 500, timeoutSeconds: 5, stars: { three: 8, two: 5 }, reverse: false }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: '4 pads, faster', startLength: 4, pads: 4, noteMs: 400, timeoutSeconds: 5, stars: { three: 10, two: 7 }, reverse: false }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: '6 pads, 3 s, Reverse mode', startLength: 4, pads: 6, noteMs: 350, timeoutSeconds: 3, stars: { three: 12, two: 9 }, reverse: true }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/** @type {readonly { id: 'classic'|'reverse'|'music', label: string, blurb: string }[]} */
export const MODES = Object.freeze([
  { id: 'classic', label: 'Classic', blurb: 'Copy the sequence' },
  { id: 'reverse', label: 'Reverse', blurb: 'Copy it backwards (Hard)' },
  { id: 'music', label: 'Music Maker', blurb: 'Free play, no score' },
]);

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

/**
 * Where the best result for a level and mode is saved. Reverse is its own track because it is a different challenge.
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {'classic'|'reverse'} mode
 * @returns {string}
 */
export const saveKey = (levelId, mode) => (mode === 'reverse' ? `${levelId}-reverse` : levelId);
