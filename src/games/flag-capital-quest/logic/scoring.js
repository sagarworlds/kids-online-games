import { THREE_STARS_AT, TWO_STARS_AT } from './levels.js';

/**
 * Stars from the correct answers in a trip of ten: 9 or 10 = 3, 7 or 8 = 2, otherwise 1.
 * @param {number} correct
 * @returns {1|2|3}
 */
export function tripStars(correct) {
  if (correct >= THREE_STARS_AT) return 3;
  if (correct >= TWO_STARS_AT) return 2;
  return 1;
}

/** Score kept for "best": 10 points for each correct answer. */
export const tripScore = (correct) => correct * 10;
