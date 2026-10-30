/**
 * Stars from the longest sequence completed, using the level's thresholds. Any round earns at least 1 star.
 * @param {{ stars: { three: number, two: number } }} level
 * @param {number} longest
 * @returns {1|2|3}
 */
export function starsFor(level, longest) {
  if (longest >= level.stars.three) return 3;
  if (longest >= level.stars.two) return 2;
  return 1;
}
