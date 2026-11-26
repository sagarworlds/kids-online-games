import { GameError } from '../../../engine/utils/errors.js';
import { randInt } from '../../../engine/utils/random.js';
import { formatMoney } from './currency.js';

/**
 * Sale day: price tags that carry a percent off ("₹40, 25% off"). The child takes the discount off each price, adds up what is left (the bill)
 * and gives change from that. All of it is whole rupees: money is never a fraction, so a price only gets a discount that comes out whole.
 *
 * @typedef {{ marked: number, percentOff: number }} Discount `marked` is the price on the tag, before the discount.
 */

/** The discounts a tag can show: a tenth, a fifth, a quarter and a half, the shares a child of this age meets first. */
export const PERCENTS = Object.freeze([10, 20, 25, 50]);

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/**
 * The step a marked price must be a multiple of so that `percent` of it is a whole number of rupees: a tenth needs a multiple of 10, a fifth
 * a multiple of 5, a quarter a multiple of 4 and a half a multiple of 2.
 *
 * @param {number} percent One of {@link PERCENTS}.
 * @returns {number}
 * @throws {GameError} 'BAD_DISCOUNT' for any other percent.
 */
export function priceStep(percent) {
  if (!PERCENTS.includes(percent)) throw new GameError('BAD_DISCOUNT', `${percent}% is not a discount the shop gives`, { percent });
  return 100 / gcd(100, percent);
}

/**
 * What `percent` off takes off a marked price.
 *
 * @param {number} marked The price on the tag, in whole rupees.
 * @param {number} percent One of {@link PERCENTS}.
 * @returns {number} Whole rupees.
 * @throws {GameError} 'BAD_DISCOUNT' when the percent is not one the shop gives or the discount would not be a whole number of rupees.
 */
export function amountOff(marked, percent) {
  const step = priceStep(percent);
  if (!Number.isInteger(marked) || marked < 1 || marked % step !== 0) {
    throw new GameError('BAD_DISCOUNT', `${percent}% off ${marked} is not a whole number of rupees`, { marked, percent });
  }
  return (marked * percent) / 100;
}

/**
 * The price after the discount: what the customer is charged for the item.
 * @param {number} marked
 * @param {number} percent
 * @returns {number}
 * @throws {GameError} 'BAD_DISCOUNT' (see {@link amountOff}).
 */
export const salePrice = (marked, percent) => marked - amountOff(marked, percent);

/**
 * A marked price from `min` to `max` that `percent` off comes out whole for, chosen at random (every such price is equally likely).
 *
 * @param {number} percent
 * @param {number} min
 * @param {number} max
 * @param {() => number} rng
 * @returns {number}
 * @throws {GameError} 'BAD_DISCOUNT' when the percent is not one the shop gives or no price in the range suits it.
 */
export function pickMarkedPrice(percent, min, max, rng) {
  const step = priceStep(percent);
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  if (first > last) throw new GameError('BAD_DISCOUNT', `no price from ${min} to ${max} takes ${percent}% off in whole rupees`, { percent, min, max });
  return randInt(rng, first, last) * step;
}

/**
 * One sentence that works a tag out, for the hint after a wrong bill: "25% off ₹40 takes off ₹10, so it costs ₹30."
 *
 * @param {{ price: number, sale: Discount }} item An item sold on Sale day (`price` is what it costs after the discount).
 * @param {import('./currency.js').Currency} currency
 * @returns {string}
 */
export function discountLine(item, currency) {
  const money = (n) => formatMoney(n, currency);
  const { marked, percentOff } = item.sale;
  return `${percentOff}% off ${money(marked)} takes off ${money(amountOff(marked, percentOff))}, so it costs ${money(item.price)}.`;
}

/** The key a level's stars are saved under: the level's own id, or `sale-<id>` on Sale day (so the two are kept apart). */
export const starsKey = (levelId, saleDay) => (saleDay ? `sale-${levelId}` : levelId);
