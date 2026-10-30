import { COOLDOWN_MS, HINTS_PER_ROUND, MISS_PENALTY_SECONDS, SCENES_PER_ROUND } from './levels.js';
import { findDifferenceAt, MIN_TAP_PX } from './hitTest.js';

/** @typedef {'hit'|'already'|'miss'|'cooldown'} TapOutcome */

/**
 * The state of one picture being played. The scene owns it and `tap` / `useHint` change it.
 * @param {number} differenceCount
 * @returns {{ found: boolean[], misses: number, cooldownUntil: number }}
 */
export const createPlay = (differenceCount) => ({ found: new Array(differenceCount).fill(false), misses: 0, cooldownUntil: 0 });

/** The state of a whole round (a few pictures in a row): hints are shared across them. @param {string} levelId @param {number} seed */
export const createRound = (levelId, seed) => ({ levelId, seed, hintsLeft: HINTS_PER_ROUND, results: [] });

/** The seed of picture number `index` in a round, so a round is a repeatable set of pictures. @param {number} roundSeed @param {number} index */
export const puzzleSeed = (roundSeed, index) => (roundSeed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;

/**
 * Handles a tap on a picture.
 * - 'hit': a new difference was found.
 * - 'already': a difference that was found before; nothing changes (no penalty for tapping it again).
 * - 'miss': nothing there; counts as a miss and pauses taps for a moment so random tapping cannot win.
 * - 'cooldown': ignored, still pausing after a miss.
 *
 * @param {ReturnType<typeof createPlay>} play
 * @param {import('./puzzle.js').Puzzle} puzzle
 * @param {{ x: number, y: number }} point In scene units.
 * @param {{ now: number, minSize?: number }} options `now` in milliseconds; `minSize` in scene units (48 px / the picture's scale).
 * @returns {{ outcome: TapOutcome, index: number }} `index` is the difference involved, or -1.
 */
export function tap(play, puzzle, point, { now, minSize = MIN_TAP_PX }) {
  if (now < play.cooldownUntil) return { outcome: 'cooldown', index: -1 };
  const fresh = findDifferenceAt(point, puzzle.differences, { minSize, ignore: (i) => play.found[i] });
  if (fresh !== -1) {
    play.found[fresh] = true;
    return { outcome: 'hit', index: fresh };
  }
  const old = findDifferenceAt(point, puzzle.differences, { minSize });
  if (old !== -1) return { outcome: 'already', index: old };
  play.misses += 1;
  play.cooldownUntil = now + COOLDOWN_MS;
  return { outcome: 'miss', index: -1 };
}

/** @param {ReturnType<typeof createPlay>} play @returns {number} */
export const foundCount = (play) => play.found.filter(Boolean).length;

/** @param {ReturnType<typeof createPlay>} play @returns {boolean} */
export const isComplete = (play) => play.found.every(Boolean);

/**
 * Uses one of the round's hints: finds a difference not found yet (the first, so the same puzzle always hints the same
 * way) and uses up a hint.
 * @returns {number} Its index, or -1 if there are no hints left or nothing left to find.
 */
export function useHint(round, play) {
  if (round.hintsLeft <= 0) return -1;
  const index = play.found.indexOf(false);
  if (index === -1) return -1;
  round.hintsLeft -= 1;
  return index;
}

/**
 * Stars for one picture. A fast, clean find (at most one miss, inside the target time) is 3; a few misses 2; anything
 * else 1. Finishing at all is always worth a star, because there is no losing.
 * @param {{ misses: number, elapsed: number, target: number }} result
 * @returns {1|2|3}
 */
export function sceneStars({ misses, elapsed, target }) {
  if (misses <= 1 && elapsed < target) return 3;
  if (misses <= 3) return 2;
  return 1;
}

/** Seconds left of the target after the time and a penalty for each miss, never below zero. */
export const timeBonus = ({ misses, elapsed, target }) => Math.max(0, Math.round(target - elapsed - MISS_PENALTY_SECONDS * misses));

/** The score of one picture: 100 for each difference and the time bonus. */
export const sceneScore = (result, differenceCount) => differenceCount * 100 + timeBonus(result);

/**
 * Stars for a round: the average of the pictures, rounded up from a half (1.5 is 2).
 * @param {readonly { stars: number }[]} results
 * @returns {number} 0 if there are no results.
 */
export function roundStars(results) {
  if (results.length === 0) return 0;
  return Math.floor(results.reduce((sum, r) => sum + r.stars, 0) / results.length + 0.5);
}

/** @returns {boolean} True when all the pictures of the round are done. @param {ReturnType<typeof createRound>} round */
export const isRoundOver = (round) => round.results.length >= SCENES_PER_ROUND;
