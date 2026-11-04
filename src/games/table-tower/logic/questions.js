import { shuffle } from '../../../engine/utils/random.js';
import { floorsOfFact } from './facts.js';

/**
 * @typedef {{
 *   key: string, table: number, multiplier: number, product: number, hide: 'product'|'multiplier',
 *   answer: number, flipped: boolean, prompt: string, spoken: string
 * }} Question
 * `table` is the floor's table and `multiplier` the 1 to 10; `flipped` shows them the other way round (6 × 17 for 17 × 6).
 */

/**
 * Makes a question from a fact.
 * @param {{ fact: import('./facts.js').Fact, floor?: number, rng: () => number, hide?: 'product'|'multiplier' }} options
 *   `floor` says which factor is the table (when the fact is on more than one floor); without it the larger one is.
 * @returns {Question}
 */
export function makeQuestion({ fact, floor, rng, hide = 'product' }) {
  const table = floor !== undefined && floorsOfFact(fact).includes(floor) ? floor : fact.large;
  const multiplier = table === fact.large ? fact.small : fact.large;
  const flipped = rng() < 0.5;
  const [first, second] = flipped ? [multiplier, table] : [table, multiplier];
  let prompt;
  if (hide === 'product') prompt = `${first} × ${second} = ?`;
  else prompt = flipped ? `? × ${table} = ${fact.product}` : `${table} × ? = ${fact.product}`;
  const spoken = hide === 'product' ? `${first} times ${second}` : `${table} times what makes ${fact.product}`;
  return { key: fact.key, table, multiplier, product: fact.product, hide, answer: hide === 'product' ? fact.product : multiplier, flipped, prompt, spoken };
}

/** @param {{ hiddenFactorShare: number }} level @param {() => number} rng @returns {'product'|'multiplier'} */
export const pickHide = (level, rng) => (level.hiddenFactorShare > 0 && rng() < level.hiddenFactorShare ? 'multiplier' : 'product');

/** The last two digits swapped (56 becomes 65), or null if that makes no new number. */
function swapLastTwoDigits(n) {
  const text = String(n);
  if (text.length < 2) return null;
  const swapped = Number(`${text.slice(0, -2)}${text.slice(-1)}${text.slice(-2, -1)}`);
  return swapped === n ? null : swapped;
}

/**
 * Four answers to choose from: the right one and three that are easy mistakes (one group too many or too few, a tens slip,
 * a digit swap, one out). All are different whole numbers above zero, in a random order.
 * @param {Question} question
 * @param {() => number} rng
 * @returns {number[]}
 */
export function makeChoices(question, rng) {
  const { answer, table, multiplier } = question;
  const wanted = question.hide === 'product'
    ? [answer + table, answer - table, answer + multiplier, answer - multiplier, answer + 10, answer - 10, swapLastTwoDigits(answer), answer + 1, answer - 1]
    : [answer + 1, answer - 1, answer + 2, answer - 2, answer + 3, answer - 3];
  const options = [...new Set(wanted.filter((n) => Number.isInteger(n) && n > 0 && n !== answer))];
  const picked = shuffle(rng, options).slice(0, 3);
  // Only reachable for tiny answers; counting up from the answer always finishes.
  for (let extra = 2; picked.length < 3; extra++) if (!picked.includes(answer + extra) && answer + extra !== answer) picked.push(answer + extra);
  return shuffle(rng, [answer, ...picked]);
}

/**
 * Reads what the child typed: a whole number of up to four digits, or null.
 * @param {unknown} text
 * @returns {number|null}
 */
export function parseAnswer(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  return /^\d{1,4}$/.test(trimmed) ? Number(trimmed) : null;
}

/** Said when an answer is wrong, with the working so the child can see why. @param {Question} question @returns {string} */
export function describeAnswer(question) {
  if (question.hide === 'product') return `${question.table} × ${question.multiplier} = ${question.product}`;
  return `${question.table} × ${question.multiplier} = ${question.product}, so the missing number is ${question.multiplier}`;
}
