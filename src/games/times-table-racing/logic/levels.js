import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, tables: readonly number[],
 *   mode: 'choice'|'type', ghostPaceMs: number, missingFactorChance: number
 * }} LevelConfig
 *
 * `mode`: four answer buttons (`choice`) or a typed answer (`type`).
 * `ghostPaceMs`: how fast the default ghost answers, used until the child has a best run of their own.
 * `missingFactorChance`: how often a question hides a factor instead of the answer (`? × 6 = 42`).
 */

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'Tables 2, 5 and 10, four buttons', tables: Object.freeze([2, 5, 10]), mode: 'choice', ghostPaceMs: 5000, missingFactorChance: 0 }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'Tables 2 to 10, four buttons', tables: Object.freeze(range(2, 10)), mode: 'choice', ghostPaceMs: 4000, missingFactorChance: 0 }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Tables 2 to 12, type the answer, missing numbers', tables: Object.freeze(range(2, 12)), mode: 'type', ghostPaceMs: 3000, missingFactorChance: 0.35 }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
/** The race ends after this many correct answers; each one moves the car 1/20 of the track. */
export const RACE_LENGTH = 20;
/** Each table is practised against 2 to 12. */
export const FACTOR_MIN = 2;
export const FACTOR_MAX = 12;
/** After a wrong answer the right fact is shown, and the car wobbles, for this long. */
export const WOBBLE_MS = 1000;
/** A missed fact comes back after this many other questions. */
export const RETRY_GAP = 3;

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
