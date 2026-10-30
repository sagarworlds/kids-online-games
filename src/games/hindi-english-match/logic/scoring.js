/**
 * Stars by moves: at most 1.5 x pairs = 3, at most 2.5 x pairs = 2, otherwise 1. (A perfect game takes exactly
 * `pairs` moves.)
 * @param {number} moves
 * @param {number} pairs
 * @returns {1|2|3}
 */
export function starsFor(moves, pairs) {
  if (moves <= pairs * 1.5) return 3;
  if (moves <= pairs * 2.5) return 2;
  return 1;
}

/**
 * A score for the personal-best table: 10 points per pair, minus a point for every move beyond a perfect game.
 * @param {number} moves
 * @param {number} pairs
 * @returns {number}
 */
export function scoreFor(moves, pairs) {
  return Math.max(0, pairs * 10 - Math.max(0, moves - pairs));
}
