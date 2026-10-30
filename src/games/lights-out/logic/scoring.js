/**
 * Stars for one puzzle: at most par moves = 3, at most par + 3 = 2, solved at all = 1.
 * @param {number} moves
 * @param {number} par
 * @returns {1|2|3}
 */
export function starsForPuzzle(moves, par) {
  if (moves <= par) return 3;
  if (moves <= par + 3) return 2;
  return 1;
}

/**
 * Stars for a whole round of puzzles: the average, rounded to the nearest whole star (never below 1).
 * @param {readonly number[]} puzzleStars
 * @returns {1|2|3}
 */
export function roundStars(puzzleStars) {
  if (puzzleStars.length === 0) return 1;
  const average = puzzleStars.reduce((a, b) => a + b, 0) / puzzleStars.length;
  if (average >= 2.5) return 3;
  if (average >= 1.5) return 2;
  return 1;
}
