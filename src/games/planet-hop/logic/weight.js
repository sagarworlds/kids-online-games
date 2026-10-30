import { GameError } from '../../../engine/utils/errors.js';

export const MIN_KG = 10;
export const MAX_KG = 150;
/** What the child sees when the weight cannot be used. */
export const WEIGHT_MESSAGE = `Please enter a number between ${MIN_KG} and ${MAX_KG}`;

/**
 * Turns what a child typed into a weight in kilograms. Whole numbers and decimals are fine, with a dot or a comma
 * ("32,5"); anything else (words, "1e2", "-5", an empty box) is refused.
 *
 * @param {string|number} input
 * @returns {number}
 * @throws {GameError} 'BAD_WEIGHT' if it is not a number from MIN_KG to MAX_KG. The message is safe to show.
 */
export function parseWeight(input) {
  const value = typeof input === 'number' ? input : /^\d+([.,]\d+)?$/.test(String(input).trim()) ? Number(String(input).trim().replace(',', '.')) : NaN;
  if (!Number.isFinite(value) || value < MIN_KG || value > MAX_KG) {
    throw new GameError('BAD_WEIGHT', WEIGHT_MESSAGE, { input: String(input) });
  }
  return value;
}

/**
 * How heavy something feels on a planet: its weight on Earth times the planet's gravity, rounded to 1 decimal.
 *
 * The sum is done in whole numbers (tenths of a kilogram times hundredths of gravity) so a result that should round
 * up, such as 25 kg on Venus = 22.75, does not come out as 22.7 because of floating-point error.
 *
 * @param {number} kg Weight on Earth, MIN_KG to MAX_KG.
 * @param {number} gravity Gravity compared with Earth (Earth = 1), above 0.
 * @returns {number}
 * @throws {GameError} 'BAD_WEIGHT' for a weight outside the range, 'BAD_GRAVITY' for a gravity that is not a positive number.
 */
export function feltWeight(kg, gravity) {
  parseWeight(kg);
  if (typeof gravity !== 'number' || !Number.isFinite(gravity) || gravity <= 0) {
    throw new GameError('BAD_GRAVITY', `gravity must be a positive number (got ${gravity})`, { gravity });
  }
  const tenthsOfKg = Math.round(kg * 10);
  const hundredths = Math.round(gravity * 100);
  return Math.round((tenthsOfKg * hundredths) / 100) / 10;
}

/** @param {number} gravity @returns {'less'|'more'|'same'} How hard the body pulls compared with Earth. */
export const pullOf = (gravity) => (gravity < 1 ? 'less' : gravity > 1 ? 'more' : 'same');

/**
 * The kid-language reason for the number on the scale. It stresses that the child does not change, only the pull.
 * @param {{ name: string, gravity: number }} body
 * @returns {string}
 */
export function explainWeight(body) {
  switch (pullOf(body.gravity)) {
    case 'less': return `${body.name} pulls on you less than Earth does, so you feel lighter. Your body is exactly the same!`;
    case 'more': return `${body.name} pulls on you more than Earth does, so you feel heavier. Your body is exactly the same!`;
    default: return 'Here your weight is your normal weight, the one you know from home. Your body is exactly the same everywhere!';
  }
}

/** Formats a weight for display: one decimal, always ("20.0 kg"), so the scale never jumps in width. */
export const formatKg = (kg) => `${kg.toFixed(1)} kg`;
