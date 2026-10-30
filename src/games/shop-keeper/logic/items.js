import { invalidData } from '../../../engine/utils/errors.js';
import { LEVELS } from './levels.js';

/** @typedef {{ name: string, icon: string, min: number, max: number }} Item  An item can be sold at any whole price from `min` to `max`. */

const FILE = 'items.json';
/** Every price should have at least this many items to choose from, so a sale is not always the same thing. */
const MIN_CHOICES_PER_PRICE = 3;

/**
 * Checks the shop's item list. Besides the shape, it makes sure every whole price the game can ask for has items to
 * sell at it, so a sale can never get stuck looking for an item that costs ₹137.
 *
 * @param {any} data
 * @returns {Item[]}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validateItems(data) {
  if (!Array.isArray(data?.items) || data.items.length === 0) invalidData(FILE, 'items', 'must be a non-empty array');
  const names = new Set();
  data.items.forEach((item, i) => {
    const at = `items[${i}]`;
    if (typeof item?.name !== 'string' || !item.name) invalidData(FILE, `${at}.name`, 'must be a non-empty string');
    if (names.has(item.name)) invalidData(FILE, `${at}.name`, `"${item.name}" appears twice`);
    names.add(item.name);
    if (typeof item.icon !== 'string' || !item.icon) invalidData(FILE, `${at}.icon`, 'must be a non-empty string');
    if (!Number.isInteger(item.min) || item.min < 1) invalidData(FILE, `${at}.min`, 'must be a whole number of 1 or more');
    if (!Number.isInteger(item.max) || item.max < item.min) invalidData(FILE, `${at}.max`, 'must be a whole number, at least min');
  });
  const lowest = Math.min(...Object.values(LEVELS).map((l) => l.priceMin));
  const highest = Math.max(...Object.values(LEVELS).map((l) => l.priceMax));
  for (let price = lowest; price <= highest; price++) {
    if (itemsAtPrice(data.items, price).length < MIN_CHOICES_PER_PRICE) {
      invalidData(FILE, 'items', `needs at least ${MIN_CHOICES_PER_PRICE} items that can cost ${price}`);
    }
  }
  return data.items;
}

/** @param {readonly Item[]} items @param {number} price @returns {Item[]} */
export const itemsAtPrice = (items, price) => items.filter((item) => item.min <= price && price <= item.max);
