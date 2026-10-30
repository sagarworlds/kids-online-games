import { levelKey } from './levels.js';

/**
 * The grown-up difficulty lock (easy/medium/hard) maps onto the three worlds.
 * @param {'easy'|'medium'|'hard'|null} lock
 * @returns {number|null} World id, or null when nothing is locked.
 */
export function worldForLock(lock) {
  return { easy: 1, medium: 2, hard: 3 }[lock] ?? null;
}

/**
 * Whether a level can be opened. Unlocking is derived from saved stars, so
 * progress persists with no extra data: a level opens once the one before it
 * has at least one star. With a difficulty lock, only the locked world is
 * playable, and its first level is always open so the child is never stuck.
 *
 * @param {{ id: number, world: number }[]} levels All levels, in order.
 * @param {number} levelId
 * @param {Record<string, number>} bestStars Saved stars by level key.
 * @param {number|null} [lockedWorld]
 * @returns {'open'|'locked'|'grown-up-locked'}
 */
export function levelStatus(levels, levelId, bestStars, lockedWorld = null) {
  const level = levels.find((l) => l.id === levelId);
  if (!level) return 'locked';
  if (lockedWorld !== null && level.world !== lockedWorld) return 'grown-up-locked';

  const index = levels.indexOf(level);
  const previous = levels[index - 1];
  const firstOfLockedWorld = lockedWorld !== null && (!previous || previous.world !== level.world);
  if (!previous || firstOfLockedWorld) return 'open';
  return (bestStars[levelKey(previous.id)] ?? 0) >= 1 ? 'open' : 'locked';
}

/**
 * The level after this one, if the child is allowed to play it.
 * @param {{ id: number, world: number }[]} levels
 * @param {number} levelId
 * @param {number|null} [lockedWorld]
 * @returns {number|null} Id of the next level, or null at the end of the game / locked world.
 */
export function nextLevelId(levels, levelId, lockedWorld = null) {
  const index = levels.findIndex((l) => l.id === levelId);
  const next = levels[index + 1];
  if (!next) return null;
  if (lockedWorld !== null && next.world !== lockedWorld) return null;
  return next.id;
}

/**
 * Counts for the level map header.
 * @param {{ id: number }[]} levels
 * @param {Record<string, number>} bestStars
 * @returns {{ stars: number, maxStars: number, completed: number }}
 */
export function summarise(levels, bestStars) {
  const earned = levels.map((l) => bestStars[levelKey(l.id)] ?? 0);
  return {
    stars: earned.reduce((a, b) => a + b, 0),
    maxStars: levels.length * 3,
    completed: earned.filter((s) => s > 0).length,
  };
}
