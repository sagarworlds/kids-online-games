import { starsForAccuracy } from '../../../engine/utils/stars.js';

/** @typedef {{ id: string, label: string, minStars: number }} Rank */

/**
 * Space ranks from the stars earned across all modes and levels (27 at most). Astronaut after about one mode done
 * well, Commander only when most of the game has been played with 2 and 3 stars.
 * @type {readonly Rank[]}
 */
export const RANKS = Object.freeze([
  Object.freeze({ id: 'space-cadet', label: 'Space Cadet', minStars: 0 }),
  Object.freeze({ id: 'astronaut', label: 'Astronaut', minStars: 8 }),
  Object.freeze({ id: 'commander', label: 'Commander', minStars: 20 }),
]);

/**
 * @param {number} totalStars Sum of the best stars over every mode and level.
 * @returns {{ rank: Rank, next: Rank|null, starsToNext: number }} The highest rank reached and what comes next.
 */
export function rankFor(totalStars) {
  let index = 0;
  RANKS.forEach((rank, i) => { if (totalStars >= rank.minStars) index = i; });
  const next = RANKS[index + 1] ?? null;
  return { rank: RANKS[index], next, starsToNext: next ? next.minStars - totalStars : 0 };
}

/**
 * Stars for a round of questions, using the shared accuracy rule.
 * @param {number} correct
 * @param {number} total Above 0.
 * @returns {1|2|3}
 */
export const questionStars = (correct, total) => starsForAccuracy(total > 0 ? correct / total : 0);

/** 10 points for each right answer. @param {number} correct */
export const questionScore = (correct) => correct * 10;
