import { GameError } from './errors.js';

/** The stars from which a level counts as done well enough to move on from: two stars is a round with few mistakes. */
export const READY_STARS = 2;

/**
 * The level a child is ready to start on: the one after the highest level they have done well on, or the first level when they have not
 * done well on any. "Done well" is `ready` stars or more at that level. So a child who has two stars on Easy is offered Medium; one who
 * skipped ahead and did well on Medium is offered Hard (not Easy); one who got a single star on Medium stays on Medium; and one who did
 * well on the last level stays on it.
 *
 * @param {readonly string[]} levels The level ids, easiest first.
 * @param {(level: string) => number} starsAt The best stars the child has at a level (0 for none).
 * @param {{ ready?: number }} [options]
 * @returns {string} One of `levels`.
 * @throws {GameError} With code 'BAD_LEVELS' when `levels` is empty.
 */
export function recommendLevel(levels, starsAt, { ready = READY_STARS } = {}) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new GameError('BAD_LEVELS', 'recommendLevel needs at least one level', { levels });
  }
  let highestDone = -1;
  levels.forEach((level, index) => {
    if (starsAt(level) >= ready) highestDone = index;
  });
  return levels[Math.min(highestDone + 1, levels.length - 1)];
}

/**
 * `starsAt` for a game that saves its stars under the level's own id (`bestStars.easy`): the great majority.
 * @param {Record<string, number>} bestStars A game's `SaveData.bestStars`.
 * @returns {(level: string) => number}
 */
export const starsByLevel = (bestStars) => (level) => bestStars[level] ?? 0;

/**
 * Which level a menu opens on, and which one (if any) it points out as suggested.
 *
 * A grown-up's lock decides everything. Otherwise the menu opens on `recommendLevel`. Only a level other than the first is pointed out: for
 * a new child, or one still working on the first level, "suggested" would only be noise.
 *
 * @param {{ lock?: string|null, levels: readonly string[], starsAt: (level: string) => number }} input
 * @returns {{ level: string, suggested: string|null }}
 * @throws {GameError} With code 'BAD_LEVELS' when `levels` is empty.
 */
export function startingLevel({ lock = null, levels, starsAt }) {
  if (lock) return { level: lock, suggested: null };
  const level = recommendLevel(levels, starsAt);
  return { level, suggested: level === levels[0] ? null : level };
}
