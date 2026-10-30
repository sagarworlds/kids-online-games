import { GameError } from '../../../engine/utils/errors.js';

/** @typedef {{ num: number, den: number }} Fraction */

/** Fractions here are always whole numbers over a positive whole number; floats are never used for comparing. */
function check({ num, den }) {
  if (!Number.isInteger(num) || !Number.isInteger(den) || den <= 0 || num < 0) {
    throw new GameError('BAD_FRACTION', `${num}/${den} is not a valid fraction`, { num, den });
  }
}

/** @param {number} a @param {number} b @returns {number} Greatest common divisor. */
export function gcd(a, b) {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/**
 * Lowest terms: 2/4 becomes 1/2.
 * @param {Fraction} f
 * @returns {Fraction}
 */
export function simplify(f) {
  check(f);
  const g = gcd(f.num, f.den) || 1;
  return { num: f.num / g, den: f.den / g };
}

/**
 * Are two fractions the same amount? Cross-multiplication (a/b = c/d when a*d = c*b), so 2/4 equals 1/2 exactly,
 * with none of the rounding trouble floats would bring.
 * @param {Fraction} a
 * @param {Fraction} b
 * @returns {boolean}
 */
export function equals(a, b) {
  check(a);
  check(b);
  return a.num * b.den === b.num * a.den;
}

/**
 * Compares sizes, also by cross-multiplication.
 * @param {Fraction} a
 * @param {Fraction} b
 * @returns {-1|0|1} -1 if a is smaller, 0 if equal, 1 if a is bigger.
 */
export function compare(a, b) {
  check(a);
  check(b);
  return Math.sign(a.num * b.den - b.num * a.den);
}

/**
 * The fraction of a pizza that `count` of its `total` slices make.
 * @param {number} count
 * @param {number} total
 * @returns {Fraction}
 */
export function fromSlices(count, total) {
  const f = { num: count, den: total };
  check(f);
  return f;
}

/**
 * How many whole slices of a `total`-slice pizza a fraction needs, or null if it does not divide evenly
 * (1/3 of an 8-slice pizza is not a whole number of slices, so that order must never be generated).
 * @param {Fraction} f
 * @param {number} total
 * @returns {number|null}
 */
export function slicesFor(f, total) {
  check(f);
  return (f.num * total) % f.den === 0 ? (f.num * total) / f.den : null;
}

/** @param {Fraction} f @returns {string} e.g. "3/8" */
export const format = (f) => `${f.num}/${f.den}`;
