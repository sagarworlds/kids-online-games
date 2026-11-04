import { GameError } from '../../../engine/utils/errors.js';
import { FLOORS } from './levels.js';

/**
 * How a table is split to make it easy. Up to 5 is easy as it is; 6 to 9 is 5 plus the rest; 10 stays whole; above 10 it is
 * the tens and the ones (17 is 10 + 7), and a whole number of tens (20, 30) is 10 + the rest. The parts always add up to n.
 *
 * @param {number} n A table from 1 to 30.
 * @returns {number[]}
 * @throws {GameError} 'BAD_FLOOR'
 */
export function splitNumber(n) {
  if (!Number.isInteger(n) || n < 1 || n > FLOORS) throw new GameError('BAD_FLOOR', `Cannot split ${n}`, { n });
  if (n <= 5 || n === 10) return [n];
  if (n < 10) return [5, n - 5];
  const rest = n % 10;
  return rest === 0 ? [10, n - 10] : [n - rest, rest];
}

/**
 * The working for one fact, split into parts: 17 × 6 is (10 × 6) + (7 × 6) = 60 + 42 = 102.
 * @param {number} n The table.
 * @param {number} m How many times (1 to 10).
 * @returns {{ parts: { factor: number, product: number }[], total: number, expression: string, sums: string, text: string }}
 */
export function explainSplit(n, m) {
  const parts = splitNumber(n).map((factor) => ({ factor, product: factor * m }));
  const total = n * m;
  if (parts.length === 1) {
    return { parts, total, expression: `${n} × ${m}`, sums: String(total), text: `${n} × ${m} = ${total}` };
  }
  const expression = parts.map((p) => `(${p.factor} × ${m})`).join(' + ');
  const sums = parts.map((p) => p.product).join(' + ');
  return { parts, total, expression, sums, text: `${expression} = ${sums} = ${total}` };
}


/**
 * The jumps of a table along the number line: n, 2n, 3n, ...
 * @param {number} n
 * @param {number} [count]
 * @returns {number[]}
 */
export const skipCount = (n, count = 10) => Array.from({ length: count }, (_, i) => n * (i + 1));

/**
 * The working shown after a miss: the split when the table has one, otherwise counting in jumps (a table that is easy to
 * count is not split, so a split would only repeat the answer).
 * @param {number} n The table.
 * @param {number} m How many times (1 to 10).
 * @returns {string}
 */
export function workingFor(n, m) {
  const split = explainSplit(n, m);
  if (split.parts.length > 1) return split.text;
  return m === 1 ? `${n} × 1 = ${n}: just one group of ${n}.` : `Count in ${n}s: ${skipCount(n, m).join(', ')}. That is ${m} jumps, so ${n} × ${m} = ${n * m}.`;
}

/**
 * A short trick that makes some tables easy. `steps(m)` gives the working for table × m, and its result is always n × m.
 * @typedef {{
 *   floor: number, id: string, title: string, rule: string,
 *   steps: (m: number) => { lines: string[], result: number }
 * }} Trick
 */

/** @type {Readonly<Record<number, Trick>>} */
export const TRICKS = Object.freeze({
  11: Object.freeze({
    floor: 11, id: 'eleven', title: 'The × 11 trick',
    rule: 'To times a single digit by 11, write the digit twice. 11 × 7 = 77. For 11 × 10, put a 0 after 11.',
    steps: (m) => (m <= 9
      ? { lines: [`11 × ${m}`, `Write ${m} twice: ${m}${m}`], result: Number(`${m}${m}`) }
      : { lines: ['11 × 10', 'Ten elevens: put a 0 after 11'], result: 110 }),
  }),
  19: Object.freeze({
    floor: 19, id: 'nineteen', title: 'The × 19 trick',
    rule: '19 is one less than 20. So 19 × n is 20 × n, take away n.',
    steps: (m) => ({ lines: [`20 × ${m} = ${20 * m}`, `${20 * m} − ${m} = ${19 * m}`], result: 20 * m - m }),
  }),
  25: Object.freeze({
    floor: 25, id: 'twentyfive', title: 'The × 25 trick',
    rule: 'Four 25s make 100. So 25 × n is n hundreds, shared into 4 (a quarter).',
    steps: (m) => ({ lines: [`${m} × 100 = ${100 * m}`, `${100 * m} ÷ 4 = ${25 * m}`], result: (100 * m) / 4 }),
  }),
});

/** @param {number} floor @returns {Trick|null} The floor's trick card, if it has one. */
export const trickFor = (floor) => TRICKS[floor] ?? null;
