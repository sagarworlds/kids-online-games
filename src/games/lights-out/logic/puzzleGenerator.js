import { GameError } from '../../../engine/utils/errors.js';
import { randInt, shuffle } from '../../../engine/utils/random.js';
import { boardFromTaps, isSolved } from './board.js';
import { getLevel } from './levels.js';

/** @typedef {{ board: boolean[][], par: number, solutionTaps: [number, number][] }} Puzzle */

const MAX_ATTEMPTS = 50;

/**
 * Makes a puzzle that is guaranteed solvable: start from an all-off board and apply `taps` random *distinct* taps.
 * Undoing those same taps solves it, so `taps` is the par, and the solver can never need more.
 *
 * @param {number} size Board is size x size.
 * @param {number} taps How many distinct jars to tap.
 * @param {() => number} rng
 * @returns {Puzzle}
 * @throws {GameError} 'BAD_TAPS' if taps is not from 1 to size*size, 'GENERATION_FAILED' if no scramble stays lit.
 */
export function generate(size, taps, rng) {
  if (!Number.isInteger(taps) || taps < 1 || taps > size * size) {
    throw new GameError('BAD_TAPS', `taps must be from 1 to ${size * size} (got ${taps})`, { size, taps });
  }
  const all = Array.from({ length: size * size }, (_, i) => [Math.floor(i / size), i % size]);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solutionTaps = shuffle(rng, all).slice(0, taps);
    const board = boardFromTaps(size, solutionTaps);
    // Some tap sets cancel out exactly; a puzzle that starts already solved is no puzzle.
    if (!isSolved(board)) return { board, par: taps, solutionTaps };
  }
  throw new GameError('GENERATION_FAILED', `could not scramble a ${size}x${size} board with ${taps} taps`, { size, taps });
}

/**
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {() => number} rng
 * @returns {Puzzle}
 */
export function generateForLevel(levelId, rng) {
  const level = getLevel(levelId);
  return generate(level.size, randInt(rng, level.minTaps, level.maxTaps), rng);
}
