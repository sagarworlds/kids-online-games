import { pick } from '../../../engine/utils/random.js';
import { compare } from './fraction.js';

/** @typedef {{ a: import('./fraction.js').Fraction, b: import('./fraction.js').Fraction, answer: 'a'|'b' }} BonusQuestion */

const CANDIDATES = [];
for (let den = 2; den <= 12; den++) for (let num = 1; num < den; num++) CANDIDATES.push({ num, den });

/** Bonus points for a right answer. */
export const BONUS_COINS = 5;

/**
 * "Which is bigger?" for two fractions that are different amounts (never 1/2 against 2/4), compared by
 * cross-multiplication, and shown in a random order so the answer is not always on the left.
 *
 * @param {() => number} rng
 * @returns {BonusQuestion}
 */
export function makeBonus(rng) {
  for (;;) {
    const x = pick(rng, CANDIDATES);
    const y = pick(rng, CANDIDATES);
    if (compare(x, y) === 0) continue;
    const bigger = compare(x, y) > 0 ? x : y;
    const smaller = bigger === x ? y : x;
    return rng() < 0.5 ? { a: bigger, b: smaller, answer: 'a' } : { a: smaller, b: bigger, answer: 'b' };
  }
}
