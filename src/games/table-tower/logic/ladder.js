import { GameError } from '../../../engine/utils/errors.js';
import { FACTS_PER_FLOOR, isFloor } from './levels.js';

/** A rung that has been missed this many times is filled in and shown, so nobody is stuck on one rung for ever. */
export const REVEAL_AFTER = 3;

/**
 * "Fill the ladder": the rungs of a table in order (17, 34, 51, ...). The state is a plain object and every function returns
 * a new one.
 * @typedef {{
 *   table: number, filled: number, mistakes: number, missesOnRung: number, shown: number[], done: boolean
 * }} Ladder
 * `filled` is how many rungs are climbed; `shown` lists the rungs (1 to 10) that were filled in for the child.
 */

/**
 * @param {number} table
 * @returns {Ladder}
 * @throws {GameError} 'BAD_FLOOR'
 */
export function createLadder(table) {
  if (!isFloor(table)) throw new GameError('BAD_FLOOR', `There is no ladder for ${table}`, { table });
  return { table, filled: 0, mistakes: 0, missesOnRung: 0, shown: [], done: false };
}

/** The number the next rung should have, or null when the ladder is done. @param {Ladder} ladder */
export const nextRung = (ladder) => (ladder.done ? null : ladder.table * (ladder.filled + 1));

/**
 * The number on the rung below the next one (0 at the bottom). @param {Ladder} ladder
 */
export const rungBelow = (ladder) => ladder.table * ladder.filled;

/**
 * Tries a number on the next rung.
 * @param {Ladder} ladder
 * @param {number} value
 * @returns {{ ladder: Ladder, correct: boolean, expected: number, revealed: boolean }}
 *   `revealed` is true when the rung was filled in after too many misses.
 * @throws {GameError} 'LADDER_DONE' if there is no rung left.
 */
export function submitRung(ladder, value) {
  const expected = nextRung(ladder);
  if (expected === null) throw new GameError('LADDER_DONE', 'The ladder is already climbed', { table: ladder.table });
  const climb = (extra) => {
    const filled = ladder.filled + 1;
    return { ...ladder, ...extra, filled, missesOnRung: 0, done: filled >= FACTS_PER_FLOOR };
  };
  if (value === expected) return { ladder: climb({}), correct: true, expected, revealed: false };

  const missesOnRung = ladder.missesOnRung + 1;
  const mistakes = ladder.mistakes + 1;
  if (missesOnRung >= REVEAL_AFTER) {
    return { ladder: climb({ mistakes, shown: [...ladder.shown, ladder.filled + 1] }), correct: false, expected, revealed: true };
  }
  return { ladder: { ...ladder, mistakes, missesOnRung }, correct: false, expected, revealed: false };
}

/**
 * A nudge for the next rung that shows how to find it without giving the number away.
 * @param {Ladder} ladder
 * @returns {string}
 */
export function hintFor(ladder) {
  if (ladder.done) return '';
  if (ladder.filled === 0) return `The first rung is ${ladder.table} × 1. Start with ${ladder.table}.`;
  return `Jump ${ladder.table} more: ${rungBelow(ladder)} + ${ladder.table} = ?`;
}

/** What is said when a rung is filled in for the child. @param {Ladder} ladder @param {number} expected */
export const revealText = (ladder, expected) => `The next rung is ${expected}: ${expected - ladder.table} + ${ladder.table} = ${expected}.`;
