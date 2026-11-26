import { GameError } from '../../../engine/utils/errors.js';
import { pick, randInt } from '../../../engine/utils/random.js';
import { noteValues } from './currency.js';
import { sum } from './change.js';
import { itemsAtPrice } from './items.js';
import { getLevel } from './levels.js';
import { pickMarkedPrice, salePrice } from './sale.js';

/**
 * @typedef {{ name: string, icon: string, price: number, sale?: import('./sale.js').Discount }} SaleItem
 * `price` is what the customer is charged. On Sale day an item also has `sale`: the price on its tag (`marked`) and the percent off it.
 * @typedef {{ items: SaleItem[], total: number, paid: number[], paidTotal: number, changeDue: number, saleDay?: boolean }} Sale
 * `paid` lists the value of each note the customer hands over. `total` is the bill, after any discounts.
 */

const MAX_ATTEMPTS = 300;

/**
 * Every amount a customer can pay with up to `maxNotes` notes, smallest first, each with the fewest notes that make it.
 * @param {readonly number[]} notes Distinct note values.
 * @param {number} maxNotes
 * @returns {{ sum: number, notes: number[] }[]}
 */
export function paymentOptions(notes, maxNotes) {
  const bySum = new Map();
  /** Builds combinations in non-decreasing order, so each multiset is made once. */
  const extend = (chosen, from) => {
    if (chosen.length > 0) {
      const total = sum(chosen);
      // Keep the way with the fewest notes: a payment of 200 is one ₹200 note, not two ₹100 notes.
      if (!bySum.has(total) || chosen.length < bySum.get(total).length) bySum.set(total, chosen.slice());
    }
    if (chosen.length === maxNotes) return;
    for (let i = from; i < notes.length; i++) extend([...chosen, notes[i]], i);
  };
  extend([], 0);
  return [...bySum.entries()].map(([total, chosen]) => ({ sum: total, notes: chosen })).sort((x, y) => x.sum - y.sum);
}

/**
 * Splits `total` into `parts` prices that each lie in [min, max], at random. Possible exactly when
 * parts*min <= total <= parts*max; choosing each part inside the range that still leaves the rest feasible means it
 * never needs a retry.
 *
 * @param {number} total
 * @param {number} parts
 * @param {number} min
 * @param {number} max
 * @param {() => number} rng
 * @returns {number[]|null} null when the total cannot be split that way.
 */
export function splitTotal(total, parts, min, max, rng) {
  if (total < parts * min || total > parts * max) return null;
  const prices = [];
  let remaining = total;
  for (let left = parts - 1; left >= 0; left--) {
    const low = Math.max(min, remaining - left * max);
    const high = Math.min(max, remaining - left * min);
    const price = randInt(rng, low, high);
    prices.push(price);
    remaining -= price;
  }
  return prices;
}

/** Picks an item that can cost `price`, preferring ones not already in this sale. */
function chooseItem(price, items, rng, used) {
  const fits = itemsAtPrice(items, price);
  if (fits.length === 0) throw new GameError('NO_ITEM_FOR_PRICE', `No item can cost ${price}`, { price });
  const fresh = fits.filter((item) => !used.has(item.name));
  const chosen = pick(rng, fresh.length ? fresh : fits);
  used.add(chosen.name);
  return chosen;
}

/** An item for the sale at a price. */
function itemFor(price, items, rng, used) {
  const { name, icon } = chooseItem(price, items, rng, used);
  return { name, icon, price };
}

/** A price tag for Sale day: a discount, a marked price it comes out whole for, and the price after it. */
function saleTag(sale, rng) {
  const percentOff = pick(rng, sale.percents);
  const marked = pickMarkedPrice(percentOff, sale.markedMin, sale.markedMax, rng);
  return { marked, percentOff, price: salePrice(marked, percentOff) };
}

/** An item for Sale day. It is the marked price that has to be one the item can cost; the customer is charged the price after the discount. */
function discountedItem({ marked, percentOff, price }, items, rng, used) {
  const { name, icon } = chooseItem(marked, items, rng, used);
  return { name, icon, price, sale: { marked, percentOff } };
}

/**
 * The customer's payment for a bill: one of the few smallest amounts above the total, so change is always due but
 * the sums stay sensible (nobody pays a ₹35 bill with a ₹500 note).
 */
function chooseUpTo(level, total, options, rng) {
  const above = options.filter((o) => o.sum > total).slice(0, level.paymentChoices);
  return above.length ? pick(rng, above) : null;
}

/**
 * Builds one sale that can always be completed: `paid >= total`, and any change due can be made (the currency has a
 * denomination of 1, which `validateCurrency` insists on).
 *
 * On levels with `exactChance` (Hard) some customers pay the exact total. Those sales are built backwards, from a
 * payment to a split into prices, because a random bill is almost never a sum of two notes.
 *
 * On Sale day every item has a percent off. The bill is the sum of the discounted prices, and the payment is chosen above that bill as
 * usual. There are no exact payments then (see `getLevel`).
 *
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {() => number} rng
 * @param {{ currency: import('./currency.js').Currency, items: readonly import('./items.js').Item[] }} data
 * @param {{ saleDay?: boolean }} [options]
 * @returns {Sale}
 * @throws {GameError} 'UNKNOWN_LEVEL', or 'SALE_GENERATION_FAILED' if the data cannot make any sale for the level.
 */
export function generateSale(levelId, rng, { currency, items }, { saleDay = false } = {}) {
  const level = getLevel(levelId, { saleDay });
  const allowed = noteValues(currency).filter((v) => !level.paymentNotes || level.paymentNotes.includes(v));
  const notes = allowed.length ? allowed : noteValues(currency);
  const options = paymentOptions(notes, level.maxPaymentNotes);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let prices;
    let payment;
    let tags = null;
    if (level.exactChance > 0 && rng() < level.exactChance) {
      const fitting = options.filter((o) => o.sum >= level.items * level.priceMin && o.sum <= Math.min(level.maxTotal, level.items * level.priceMax));
      if (fitting.length === 0) continue;
      payment = pick(rng, fitting);
      prices = splitTotal(payment.sum, level.items, level.priceMin, level.priceMax, rng);
    } else if (saleDay) {
      tags = Array.from({ length: level.items }, () => saleTag(level.sale, rng));
      prices = tags.map((tag) => tag.price);
      const total = sum(prices);
      payment = total <= level.maxTotal ? chooseUpTo(level, total, options, rng) : null;
    } else {
      prices = Array.from({ length: level.items }, () => randInt(rng, level.priceMin, level.priceMax));
      const total = sum(prices);
      payment = total <= level.maxTotal ? chooseUpTo(level, total, options, rng) : null;
    }
    if (!prices || !payment) continue;

    const used = new Set();
    const total = sum(prices);
    return {
      items: tags ? tags.map((tag) => discountedItem(tag, items, rng, used)) : prices.map((price) => itemFor(price, items, rng, used)),
      total, paid: payment.notes.slice().sort((a, b) => b - a), paidTotal: payment.sum, changeDue: payment.sum - total,
      ...(saleDay ? { saleDay: true } : {}),
    };
  }
  throw new GameError('SALE_GENERATION_FAILED', `Could not make a ${levelId} sale from this currency and item list`, { levelId });
}

/**
 * The whole round's customers.
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {number} count
 * @param {() => number} rng
 * @param {Parameters<typeof generateSale>[2]} data
 * @param {{ saleDay?: boolean }} [options]
 * @returns {Sale[]}
 */
export function generateRound(levelId, count, rng, data, options = {}) {
  if (!Number.isInteger(count) || count < 1) throw new GameError('BAD_COUNT', 'count must be a whole number of 1 or more', { count });
  return Array.from({ length: count }, () => generateSale(levelId, rng, data, options));
}
