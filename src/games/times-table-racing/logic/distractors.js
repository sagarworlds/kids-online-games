import { shuffle, pick } from '../../../engine/utils/random.js';
import { correctValue } from './facts.js';

const OPTION_COUNT = 4;

/**
 * Swaps the last two digits, the classic slip (56 becomes 65, 132 becomes 123). Returns null when that gives nothing
 * new or would start with a zero.
 * @param {number} n
 * @returns {number|null}
 */
export function swapDigits(n) {
  const digits = String(n);
  if (digits.length < 2) return null;
  const swapped = digits.slice(0, -2) + digits.slice(-1) + digits.slice(-2, -1);
  if (swapped === digits || swapped[0] === '0') return null;
  return Number(swapped);
}

/**
 * Four answer choices: the right one and three near misses, shuffled.
 *
 * The near misses are the mistakes children really make: the answer plus or minus one of the two numbers being
 * multiplied (a "one group too many or too few" slip), the answer with its last two digits swapped, and the answer
 * plus or minus 1. One of each kind is used where it exists. All four options are different whole numbers above
 * zero. If a kind is missing (no digits to swap) the gap is filled from the others, and failing that from widening
 * offsets, so there are always exactly four.
 *
 * For a hidden factor (`? × 6 = 42`) the options are close numbers around the missing factor instead.
 *
 * @param {import('./facts.js').Question} question
 * @param {() => number} rng
 * @returns {number[]} Four unique positive numbers, one of which is `correctValue(question)`.
 */
export function makeOptions(question, rng) {
  const target = correctValue(question);
  const valid = (n) => Number.isInteger(n) && n > 0 && n !== target;

  const groups = question.missing === 'answer'
    ? [
      [target + question.a, target - question.a, target + question.b, target - question.b],
      [swapDigits(target)],
      [target + 1, target - 1],
    ]
    : [[target + 1, target - 1], [target + 2, target - 2], [swapDigits(target)]];

  const chosen = [];
  const take = (n) => { if (valid(n) && !chosen.includes(n)) chosen.push(n); };
  // One from each kind first, so the three wrong answers are not all the same sort of mistake.
  for (const group of groups) {
    const candidates = group.filter((n) => valid(n) && !chosen.includes(n));
    if (candidates.length) take(pick(rng, candidates));
  }
  for (const n of shuffle(rng, groups.flat())) {
    if (chosen.length >= OPTION_COUNT - 1) break;
    take(n);
  }
  // Last resort for tiny targets (an answer of 2 has few neighbours): widen the offsets.
  for (let offset = 1; chosen.length < OPTION_COUNT - 1; offset++) {
    take(target + offset);
    if (chosen.length < OPTION_COUNT - 1) take(target - offset);
  }
  return shuffle(rng, [target, ...chosen.slice(0, OPTION_COUNT - 1)]);
}
