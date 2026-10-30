import { starsForAccuracy } from '../../../engine/utils/stars.js';

/**
 * Stars for building a habitat, from the arrows that were wrong at the first Check: none = 3, one or two = 2, more = 1.
 * @param {number} wrongAtFirstCheck
 * @returns {1|2|3}
 */
export function builderStars(wrongAtFirstCheck) {
  if (wrongAtFirstCheck <= 0) return 3;
  if (wrongAtFirstCheck <= 2) return 2;
  return 1;
}

/**
 * Stars for a Hard habitat: the average of the building stars and the "What if?" stars (the shared accuracy rule),
 * rounded to the nearest whole star with a half going up.
 *
 * @param {1|2|3} builder
 * @param {number} correct Right predictions.
 * @param {number} total Predictions asked.
 * @returns {1|2|3}
 */
export function combinedStars(builder, correct, total) {
  const whatIf = starsForAccuracy(total > 0 ? correct / total : 0);
  return /** @type {1|2|3} */ (Math.floor((builder + whatIf) / 2 + 0.5));
}

/** 100 points a star, and 10 for each right prediction. @param {number} stars @param {number} [whatIfCorrect] */
export const habitatScore = (stars, whatIfCorrect = 0) => stars * 100 + whatIfCorrect * 10;
