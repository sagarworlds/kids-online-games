import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string,
 *   items: number, priceMin: number, priceMax: number, maxTotal: number,
 *   showTotal: boolean, liveTray: boolean, noChangeButton: boolean,
 *   paymentNotes: readonly number[]|null, maxPaymentNotes: number, paymentChoices: number, exactChance: number
 * }} LevelConfig
 *
 * `showTotal`: the till tells the child the total (Easy); otherwise they add the prices up and type it.
 * `liveTray`: the tray shows its running total while the child fills it (Easy only).
 * `paymentNotes`: only these notes are used to pay (null = any), `maxPaymentNotes`: most notes in one payment,
 * `paymentChoices`: the payment is picked at random from this many of the closest amounts above the total.
 * `exactChance`: how often the customer pays the exact total, so no change is due (the child taps "No change needed").
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({
    id: 'easy', label: 'Easy', blurb: 'One item, the total is shown',
    items: 1, priceMin: 1, priceMax: 50, maxTotal: 50, showTotal: true, liveTray: true, noChangeButton: false,
    paymentNotes: Object.freeze([10, 20, 50, 100]), maxPaymentNotes: 1, paymentChoices: 1, exactChance: 0,
  }),
  medium: Object.freeze({
    id: 'medium', label: 'Medium', blurb: 'Two items, you add up the total',
    items: 2, priceMin: 5, priceMax: 150, maxTotal: 300, showTotal: false, liveTray: false, noChangeButton: false,
    paymentNotes: null, maxPaymentNotes: 1, paymentChoices: 3, exactChance: 0,
  }),
  hard: Object.freeze({
    id: 'hard', label: 'Hard', blurb: 'Three items, big notes, sometimes no change',
    items: 3, priceMin: 10, priceMax: 450, maxTotal: 1000, showTotal: false, liveTray: false, noChangeButton: true,
    paymentNotes: null, maxPaymentNotes: 2, paymentChoices: 4, exactChance: 0.2,
  }),
});

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
 * @returns {Readonly<LevelConfig>}
 * @throws {GameError} 'UNKNOWN_LEVEL'
 */
export function getLevel(id) {
  const level = LEVELS[id];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `Unknown level "${id}"`, { id });
  return level;
}
