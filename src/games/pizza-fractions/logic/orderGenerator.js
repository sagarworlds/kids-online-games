import { GameError } from '../../../engine/utils/errors.js';
import { pick, randInt, shuffle } from '../../../engine/utils/random.js';
import { gcd, slicesFor } from './fraction.js';
import { getLevel } from './levels.js';

/**
 * @typedef {import('./fraction.js').Fraction} Fraction
 * @typedef {{ topping: string, amount: Fraction }} OrderLine
 * @typedef {{ id: number, customer: string, lines: OrderLine[], slices: number }} Order
 */

export const CUSTOMER_NAMES = Object.freeze(['Asha', 'Ravi', 'Mina', 'Kabir', 'Tara', 'Omar', 'Lila', 'Dev', 'Zoya', 'Arjun', 'Nisha', 'Sam']);

/** On Medium and Hard, about this share of lines use an equivalent fraction. */
const EQUIVALENT_SHARE = 0.7;

const divisorsOf = (n) => Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0);

/**
 * Orders that are a whole number of slices on an n-slice pizza and less than the whole pizza.
 * - 'same': the denominator is the number of slices ("3/8" on 8 slices).
 * - 'equivalent': a *smaller* denominator that divides the slices, in lowest terms ("1/3" on 6, "1/2" on 8), so the
 *   child has to work out how many slices that is. A denominator that divides the slice count is exactly what makes
 *   the order possible: "1/3" of an 8-slice pizza never appears.
 */
function fractionOptions(slices, kind) {
  const denominators = kind === 'same' ? [slices] : divisorsOf(slices).filter((d) => d > 1 && d < slices);
  const options = [];
  for (const den of denominators) {
    for (let num = 1; num < den; num++) {
      if (kind === 'equivalent' && gcd(num, den) !== 1) continue;
      options.push({ num, den });
    }
  }
  return options;
}

/**
 * Creates an order that can always be filled: every line needs a whole number of slices (1/3 is never asked on an
 * 8-slice pizza), and on Hard the two lines together fit on the pizza without overlapping.
 *
 * - Easy: the fraction uses the same denominator as the cut ("3/8" on 8 slices).
 * - Medium: mostly equivalent fractions ("1/3" on 6 slices), the rest same-denominator.
 * - Hard: two different toppings, like "1/4 mushroom and 1/2 cheese".
 *
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {() => number} rng
 * @param {number} id
 * @returns {Order}
 * @throws {GameError} 'UNKNOWN_LEVEL'
 */
export function generateOrder(levelId, rng, id = 1) {
  const level = getLevel(levelId);
  const slices = pick(rng, level.slices);
  const customer = CUSTOMER_NAMES[(id - 1) % CUSTOMER_NAMES.length];
  const toppings = shuffle(rng, level.toppings);

  const oneLine = (topping) => {
    const wantEquivalent = level.equivalents && rng() < EQUIVALENT_SHARE;
    // A 2-slice pizza has no equivalent form (only 1/2), so it falls back to the same-denominator pool.
    const equivalent = wantEquivalent ? fractionOptions(slices, 'equivalent') : [];
    const options = equivalent.length ? equivalent : fractionOptions(slices, 'same');
    return { topping, amount: pick(rng, options) };
  };

  if (!level.twoToppings) return { id, customer, lines: [oneLine(toppings[0])], slices };

  for (let attempt = 0; attempt < 100; attempt++) {
    const lines = [oneLine(toppings[0]), oneLine(toppings[1])];
    const needed = lines.map((l) => slicesFor(l.amount, slices));
    if (needed.every((n) => n >= 1) && needed[0] + needed[1] <= slices) return { id, customer, lines, slices };
  }
  // Always valid: one slice of each (a whole-slice fraction of the cut), so generation can never fail.
  return { id, customer, lines: [{ topping: toppings[0], amount: { num: 1, den: slices } }, { topping: toppings[1], amount: { num: 1, den: slices } }], slices };
}

/**
 * The whole round's orders, each with a different customer name.
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {number} count
 * @param {() => number} rng
 * @returns {Order[]}
 */
export function generateRound(levelId, count, rng) {
  if (!Number.isInteger(count) || count < 1) throw new GameError('BAD_COUNT', 'count must be a whole number of 1 or more', { count });
  const start = randInt(rng, 0, CUSTOMER_NAMES.length - 1);
  return Array.from({ length: count }, (_, i) => generateOrder(levelId, rng, start + i + 1));
}
