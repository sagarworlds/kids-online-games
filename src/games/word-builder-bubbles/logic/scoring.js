/** A word with this many mistakes or more is "tricky" and listed for more practice. */
export const TRICKY_FROM = 2;

/**
 * Stars from the average number of mistakes per word: 1 or fewer = 3 stars, 2 or fewer = 2, otherwise 1.
 * @param {readonly { mistakes: number }[]} results
 * @returns {1|2|3}
 */
export function roundStars(results) {
  if (results.length === 0) return 1;
  const average = results.reduce((sum, r) => sum + r.mistakes, 0) / results.length;
  if (average <= 1) return 3;
  if (average <= 2) return 2;
  return 1;
}

/** @param {readonly { word: string, mistakes: number }[]} results @returns {string[]} Words with 2 or more mistakes. */
export const trickyWords = (results) => results.filter((r) => r.mistakes >= TRICKY_FROM).map((r) => r.word);

/** Score kept for "best": the more words spelled without a mistake the better. */
export const roundScore = (results) => results.reduce((sum, r) => sum + Math.max(0, 10 - r.mistakes * 3), 0);
