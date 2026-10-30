import { invalidData } from '../../../engine/utils/errors.js';

/**
 * @typedef {{ value: number, kind: 'coin'|'note', label: string, color: string }} Denomination
 * @typedef {{ code: string, symbol: string, name: string, denominations: Denomination[] }} Currency
 */

const FILE = 'currency file';
const KINDS = ['coin', 'note'];

/**
 * Checks a currency file. Nothing in the game is hard-wired to rupees: a different file with its own symbol and
 * denominations changes the coins, notes and every message without a code edit.
 *
 * @param {any} data
 * @returns {Currency}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA' naming the field.
 */
export function validateCurrency(data) {
  if (!data || typeof data !== 'object') invalidData(FILE, '(root)', 'must be an object');
  for (const field of ['code', 'symbol', 'name']) {
    if (typeof data[field] !== 'string' || !data[field]) invalidData(FILE, field, 'must be a non-empty string');
  }
  if (!Array.isArray(data.denominations) || data.denominations.length === 0) {
    invalidData(FILE, 'denominations', 'must be a non-empty list');
  }
  const seen = new Set();
  data.denominations.forEach((d, i) => {
    const where = `denominations[${i}]`;
    if (!Number.isInteger(d?.value) || d.value < 1) invalidData(FILE, `${where}.value`, 'must be a whole number of 1 or more');
    if (!KINDS.includes(d.kind)) invalidData(FILE, `${where}.kind`, 'must be "coin" or "note"');
    if (typeof d.label !== 'string' || !d.label) invalidData(FILE, `${where}.label`, 'must be a non-empty string');
    if (typeof d.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(d.color)) invalidData(FILE, `${where}.color`, 'must be a hex colour such as #c9ced6');
    const key = `${d.kind}-${d.value}`;
    if (seen.has(key)) invalidData(FILE, where, `${d.kind} of ${d.value} is listed twice`);
    seen.add(key);
  });
  if (!data.denominations.some((d) => d.value === 1)) {
    invalidData(FILE, 'denominations', 'needs a denomination of 1, or some change amounts could not be made');
  }
  if (!data.denominations.some((d) => d.kind === 'note')) invalidData(FILE, 'denominations', 'needs at least one note for customers to pay with');
  return data;
}

/** @param {number} amount @param {Currency} currency @returns {string} e.g. "₹50". Whole units only, never decimals. */
export const formatMoney = (amount, currency) => `${currency.symbol}${amount}`;

/** @param {Currency} currency @returns {number[]} The distinct note values, smallest first. */
export const noteValues = (currency) => [...new Set(currency.denominations.filter((d) => d.kind === 'note').map((d) => d.value))].sort((a, b) => a - b);

/**
 * The denomination to draw for a value of a given kind (a ₹10 coin and a ₹10 note are different pieces).
 * @param {Currency} currency
 * @param {number} value
 * @param {'coin'|'note'} [kind] Falls back to whichever exists.
 * @returns {Denomination|undefined}
 */
export const findDenomination = (currency, value, kind) =>
  currency.denominations.find((d) => d.value === value && (!kind || d.kind === kind))
  ?? currency.denominations.find((d) => d.value === value);
