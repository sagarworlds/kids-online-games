import { GameError } from '../../../engine/utils/errors.js';
import { pick } from '../../../engine/utils/random.js';
import { repeating } from './generators/repeating.js';
import { growing } from './generators/growing.js';
import { addConstant, subtractConstant } from './generators/arithmetic.js';
import { multiply } from './generators/multiply.js';
import { twoAttributes } from './generators/twoAttributes.js';
import { alternating } from './generators/alternating.js';
import { missingMiddle } from './generators/missingMiddle.js';
import { rotation } from './generators/rotation.js';
import { getLevel } from './levels.js';

/**
 * @typedef {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('./puzzle.js').Puzzle }} Generator
 */

/**
 * Every kind of case. To add a new kind of pattern: write a generator file that exports `{ id, levels, generate }` and
 * add it to this list. Nothing else changes: the rest of the game only ever asks the registry for a puzzle.
 * @type {readonly Generator[]}
 */
export const GENERATORS = Object.freeze([repeating, growing, addConstant, subtractConstant, multiply, twoAttributes, alternating, missingMiddle, rotation]);

/** @param {string} levelId @param {readonly Generator[]} [generators] @returns {Generator[]} The kinds allowed at a level. */
export function generatorsFor(levelId, generators = GENERATORS) {
  getLevel(levelId);
  return generators.filter((g) => g.levels.includes(levelId));
}

/**
 * One puzzle of a type allowed at the level, never the same type as the previous case when there is a choice.
 *
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {() => number} rng
 * @param {{ previousType?: string|null, generators?: readonly Generator[] }} [options]
 * @returns {import('./puzzle.js').Puzzle}
 * @throws {GameError} 'NO_GENERATORS' if nothing is allowed at the level.
 */
export function generatePuzzle(levelId, rng, { previousType = null, generators = GENERATORS } = {}) {
  const allowed = generatorsFor(levelId, generators);
  if (allowed.length === 0) throw new GameError('NO_GENERATORS', `No pattern type is allowed at level "${levelId}"`, { levelId });
  const fresh = allowed.filter((g) => g.id !== previousType);
  return pick(rng, fresh.length ? fresh : allowed).generate(rng, levelId);
}

/**
 * The cases for a round.
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {number} count
 * @param {() => number} rng
 * @param {readonly Generator[]} [generators]
 * @returns {import('./puzzle.js').Puzzle[]}
 */
export function generateRound(levelId, count, rng, generators = GENERATORS) {
  const puzzles = [];
  let previousType = null;
  for (let i = 0; i < count; i++) {
    const puzzle = generatePuzzle(levelId, rng, { previousType, generators });
    puzzles.push(puzzle);
    previousType = puzzle.type;
  }
  return puzzles;
}
