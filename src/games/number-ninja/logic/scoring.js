import { GameError } from '../../../engine/utils/errors.js';
import { starsForAccuracy } from '../../../engine/utils/stars.js';

export const BASE_POINTS = 10;
export const STREAK_BONUS = 2;
export const MAX_POINTS = 30;

/**
 * Points for a correct answer: 10 + 2 per answer already in the streak, capped at 30.
 * The cap stops a long streak from dwarfing everything else on the leaderboard-free score.
 *
 * @param {number} streak Correct answers in a row *before* this one (0 for the first).
 * @returns {number}
 * @throws {GameError} 'BAD_STREAK' if streak is not a non-negative whole number.
 */
export function scoreAnswer(streak) {
  if (!Number.isInteger(streak) || streak < 0) {
    throw new GameError('BAD_STREAK', `streak must be a whole number >= 0 (got ${streak})`, { streak });
  }
  return Math.min(MAX_POINTS, BASE_POINTS + streak * STREAK_BONUS);
}

/**
 * Fraction of attempts that were right. Every wrong submission and every star
 * that reached the ground counts as an attempt.
 * @param {{ correct: number, wrong: number, missed: number }} counts
 * @returns {number} 0 to 1 (0 when nothing was attempted).
 */
export function accuracyOf({ correct, wrong, missed }) {
  const attempts = correct + wrong + missed;
  return attempts === 0 ? 0 : correct / attempts;
}

/**
 * Number Ninja uses the shared default star rule (90% = 3, 70% = 2, else 1).
 * @param {number} accuracy 0 to 1.
 * @returns {1|2|3}
 */
export function starsFor(accuracy) {
  return starsForAccuracy(accuracy);
}
