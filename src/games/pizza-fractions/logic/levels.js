import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, slices: readonly number[],
 *   toppings: readonly string[], equivalents: boolean, twoToppings: boolean, bonus: boolean
 * }} LevelConfig
 * `equivalents`: orders may be an equivalent fraction (1/3 on a 6-slice pizza). `twoToppings`: two toppings per
 * order that must not overlap. `bonus`: a "which is bigger?" question after each customer.
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'Halves, quarters, eighths', slices: [2, 4, 8], toppings: ['pepperoni', 'olive'], equivalents: false, twoToppings: false, bonus: false }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'Equal fractions like 1/3 = 2/6', slices: [4, 6, 8, 12], toppings: ['pepperoni', 'olive', 'mushroom'], equivalents: true, twoToppings: false, bonus: false }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Two toppings, bonus questions', slices: [6, 8, 10, 12], toppings: ['pepperoni', 'olive', 'mushroom', 'cheese'], equivalents: true, twoToppings: true, bonus: true }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
export const CUSTOMERS_PER_ROUND = 8;
/** After a wrong serve the child may try again this many times. */
export const MAX_RETRIES = 2;

/**
 * @param {string} id
 * @returns {Readonly<LevelConfig>}
 * @throws {GameError} 'UNKNOWN_LEVEL'
 */
export function getLevel(id) {
  const level = LEVELS[id];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `Unknown level "${id}"`, { id });
  return level;
}
