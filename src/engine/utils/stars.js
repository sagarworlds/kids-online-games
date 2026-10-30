/**
 * The default star rule shared by every game (games may override it):
 * accuracy of 90% or more earns 3 stars, 70% or more earns 2, anything else 1.
 * Every finished round earns at least one star so a child never leaves empty-handed.
 * @param {number} accuracy Fraction between 0 and 1.
 * @returns {1|2|3}
 */
export function starsForAccuracy(accuracy) {
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.7) return 2;
  return 1;
}

/** Positive messages for the results screen; never negative. */
export const PRAISE = Object.freeze({
  3: ['Amazing work!', 'Superstar!', 'You nailed it!'],
  2: ['Great job!', 'Well done!', 'Nice going!'],
  1: ['Good try, keep practising!', 'You are getting better!', 'Every try makes you stronger!'],
});

/**
 * Picks a praise line for a star count.
 * @param {1|2|3} stars
 * @param {() => number} rng
 * @returns {string}
 */
export function praiseFor(stars, rng) {
  const lines = PRAISE[stars] ?? PRAISE[1];
  return lines[Math.floor(rng() * lines.length)];
}
