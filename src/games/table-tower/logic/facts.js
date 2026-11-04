import { GameError } from '../../../engine/utils/errors.js';
import { FLOORS, FACTS_PER_FLOOR } from './levels.js';

/**
 * A multiplication fact. 6 × 7 and 7 × 6 are one fact (the same thing to remember), so a fact is named by its smaller
 * factor first. The tower only asks table × (1 to 10), so the smaller factor is never above 10 and the larger never above 30.
 * @typedef {{ key: string, small: number, large: number, product: number }} Fact
 */

/** @param {number} a @param {number} b @returns {string} e.g. "6x17" */
export const factKey = (a, b) => `${Math.min(a, b)}x${Math.max(a, b)}`;

/**
 * @param {number} a
 * @param {number} b
 * @returns {Fact}
 * @throws {GameError} 'BAD_FACT' if it is not a fact the tower asks.
 */
export function makeFact(a, b) {
  const small = Math.min(a, b);
  const large = Math.max(a, b);
  // Checked on the arguments themselves: Math.min would quietly turn the text "3" into a number.
  if (!Number.isInteger(a) || !Number.isInteger(b) || small < 1 || small > FACTS_PER_FLOOR || large > FLOORS) {
    throw new GameError('BAD_FACT', `${a} × ${b} is not a fact in the tower`, { a, b });
  }
  return Object.freeze({ key: factKey(small, large), small, large, product: small * large });
}

/**
 * Reads a fact's key back (used for saved data, which may be damaged).
 * @param {unknown} key
 * @returns {Fact}
 * @throws {GameError} 'BAD_FACT'
 */
export function parseFactKey(key) {
  const match = typeof key === 'string' ? /^(\d{1,2})x(\d{1,2})$/.exec(key) : null;
  if (!match || Number(match[1]) > Number(match[2])) throw new GameError('BAD_FACT', `"${key}" is not a fact key`, { key });
  return makeFact(Number(match[1]), Number(match[2]));
}

/**
 * The ten facts of a floor: the table times 1 to 10.
 * @param {number} floor
 * @returns {Fact[]}
 */
export function factsForFloor(floor) {
  return Array.from({ length: FACTS_PER_FLOOR }, (_, i) => makeFact(floor, i + 1));
}

/** Every different fact in the tower (255: the small tables share facts, like 6 × 7 and 7 × 6). @returns {Fact[]} */
export function allFacts() {
  const byKey = new Map();
  for (let floor = 1; floor <= FLOORS; floor++) for (const fact of factsForFloor(floor)) byKey.set(fact.key, fact);
  return [...byKey.values()];
}

/** The floors a fact appears on: both of its factors when they are both 10 or less, otherwise just the larger. @param {Fact} fact @returns {number[]} */
export const floorsOfFact = (fact) => (fact.large <= FACTS_PER_FLOOR ? [...new Set([fact.small, fact.large])] : [fact.large]);
