import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string,
 *   items: number, priceMin: number, priceMax: number, maxTotal: number,
 *   showTotal: boolean, liveTray: boolean, noChangeButton: boolean,
 *   paymentNotes: readonly number[]|null, maxPaymentNotes: number, paymentChoices: number, exactChance: number,
 *   sale: { blurb: string, percents: readonly number[], markedMin: number, markedMax: number }
 * }} LevelConfig
 *
 * `showTotal`: the till tells the child the total (Easy); otherwise they add the prices up and type it.
 * `liveTray`: the tray shows its running total while the child fills it (Easy only).
 * `paymentNotes`: only these notes are used to pay (null = any), `maxPaymentNotes`: most notes in one payment,
 * `paymentChoices`: the payment is picked at random from this many of the closest amounts above the total.
 * `exactChance`: how often the customer pays the exact total, so no change is due (the child taps "No change needed").
 * `sale`: what the level is on Sale day (see `getLevel`): its menu line, the discounts a price tag may show (`percents`, from `PERCENTS` in
 * `sale.js`) and the range of the marked prices, which are the prices before the discount.
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({
    id: 'easy', label: 'Easy', blurb: 'One item, the total is shown',
    items: 1, priceMin: 1, priceMax: 50, maxTotal: 50, showTotal: true, liveTray: true, noChangeButton: false,
    paymentNotes: Object.freeze([10, 20, 50, 100]), maxPaymentNotes: 1, paymentChoices: 1, exactChance: 0,
    sale: Object.freeze({ blurb: 'One item, half price', percents: Object.freeze([50]), markedMin: 10, markedMax: 100 }),
  }),
  medium: Object.freeze({
    id: 'medium', label: 'Medium', blurb: 'Two items, you add up the total',
    items: 2, priceMin: 5, priceMax: 150, maxTotal: 300, showTotal: false, liveTray: false, noChangeButton: false,
    paymentNotes: null, maxPaymentNotes: 1, paymentChoices: 3, exactChance: 0,
    sale: Object.freeze({ blurb: 'Two items, 10% to 50% off', percents: Object.freeze([50, 25, 10]), markedMin: 20, markedMax: 200 }),
  }),
  hard: Object.freeze({
    id: 'hard', label: 'Hard', blurb: 'Three items, big notes, sometimes no change',
    items: 3, priceMin: 10, priceMax: 450, maxTotal: 1000, showTotal: false, liveTray: false, noChangeButton: true,
    paymentNotes: null, maxPaymentNotes: 2, paymentChoices: 4, exactChance: 0.2,
    sale: Object.freeze({ blurb: 'Three items, 10% to 50% off', percents: Object.freeze([50, 25, 20, 10]), markedMin: 40, markedMax: 400 }),
  }),
});

/**
 * What changes in a level on Sale day. The child always works out the bill (the discounts are what they are learning, so the till does not
 * show it), and no customer pays the exact bill: a bill cannot be built backwards from a payment when every price has to be a discounted one.
 */
const SALE_DAY = Object.freeze({ showTotal: false, noChangeButton: false, exactChance: 0 });

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
const SALE_LEVELS = Object.freeze(Object.fromEntries(Object.entries(LEVELS).map(([id, level]) => [id, Object.freeze({ ...level, ...SALE_DAY })])));

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
export const CUSTOMERS_PER_ROUND = 6;
/** The tray holds at most this many pieces, so a runaway pile of ₹1 coins cannot fill the screen. */
export const MAX_TRAY_PIECES = 24;
/** After a wrong change the child may try again this many times; the next wrong one shows the answer. */
export const MAX_CHANGE_RETRIES = 2;
/** Wrong totals allowed before the till shows the total (Medium and Hard). */
export const MAX_TOTAL_TRIES = 3;

/**
 * @param {string} id
 * @param {{ saleDay?: boolean }} [options] With `saleDay`, the level as it is on Sale day: the child works out the bill after the discounts
 *   (`sale` says which), and there are no exact payments.
 * @returns {Readonly<LevelConfig>}
 * @throws {GameError} 'UNKNOWN_LEVEL'
 */
export function getLevel(id, { saleDay = false } = {}) {
  const level = (saleDay ? SALE_LEVELS : LEVELS)[id];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `Unknown level "${id}"`, { id });
  return level;
}
