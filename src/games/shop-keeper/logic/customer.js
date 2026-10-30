import { GameError } from '../../../engine/utils/errors.js';
import { checkChange } from './change.js';
import { MAX_CHANGE_RETRIES, MAX_TOTAL_TRIES } from './levels.js';

/**
 * @typedef {import('./saleGenerator.js').Sale} Sale
 * @typedef {'total'|'change'|'done'} Phase
 * @typedef {{ sale: Sale, phase: Phase, totalWrong: number, changeWrong: number, failed: boolean, smart: boolean }} Customer
 *
 * The state of one customer's sale as the child works through it: first (Medium and Hard) add up the total, then
 * give change. Every function returns a *new* customer and never changes the one it was given.
 */

/**
 * @param {Sale} sale
 * @param {{ showTotal: boolean }} level Easy shows the total, so it starts straight at the change.
 * @returns {Customer}
 */
export function startCustomer(sale, level) {
  return Object.freeze({ sale, phase: level.showTotal ? 'change' : 'total', totalWrong: 0, changeWrong: 0, failed: false, smart: false });
}

function expectPhase(customer, phase) {
  if (customer.phase !== phase) {
    throw new GameError('WRONG_PHASE', `Expected the ${phase} step but the sale is at "${customer.phase}"`, { phase: customer.phase });
  }
}

/**
 * The child types the total they added up.
 * `invalid` (not a whole number) is not a mistake and costs nothing; `revealed` means the third wrong answer, so the
 * till shows the right total and the sale moves on to the change.
 *
 * @param {Customer} customer
 * @param {string|number} typed
 * @returns {{ kind: 'invalid'|'correct'|'wrong'|'revealed', customer: Customer, wrongCount?: number }}
 */
export function submitTotal(customer, typed) {
  expectPhase(customer, 'total');
  const text = String(typed).trim();
  if (!/^\d{1,6}$/.test(text)) return { kind: 'invalid', customer };
  if (Number(text) === customer.sale.total) return { kind: 'correct', customer: Object.freeze({ ...customer, phase: 'change' }) };
  const totalWrong = customer.totalWrong + 1;
  if (totalWrong >= MAX_TOTAL_TRIES) return { kind: 'revealed', customer: Object.freeze({ ...customer, totalWrong, phase: 'change' }) };
  return { kind: 'wrong', customer: Object.freeze({ ...customer, totalWrong }), wrongCount: totalWrong };
}

/**
 * The child presses "Give change".
 * - `empty`: nothing in the tray, so nothing is checked and no try is used.
 * - `exact`: right. `smart` says it was done in the fewest pieces.
 * - `tooMuch` / `tooLittle`: wrong by `diff`; the child may retry up to MAX_CHANGE_RETRIES times.
 * - `failed`: the last retry was also wrong. The sale ends and the answer is shown.
 *
 * @param {Customer} customer
 * @param {readonly number[]} trayValues
 * @param {readonly { value: number }[]} denominations
 * @returns {{ kind: 'empty'|'exact'|'tooMuch'|'tooLittle'|'failed', customer: Customer, check: import('./change.js').ChangeCheck, diff: number }}
 */
export function submitChange(customer, trayValues, denominations) {
  expectPhase(customer, 'change');
  const check = checkChange(customer.sale, trayValues, denominations);
  if (check.kind === 'empty') return { kind: 'empty', customer, check, diff: check.diff };
  if (check.kind === 'exact') {
    return { kind: 'exact', customer: Object.freeze({ ...customer, phase: 'done', smart: check.smart }), check, diff: 0 };
  }
  const changeWrong = customer.changeWrong + 1;
  if (changeWrong > MAX_CHANGE_RETRIES) {
    return { kind: 'failed', customer: Object.freeze({ ...customer, phase: 'done', changeWrong, failed: true }), check, diff: check.diff };
  }
  return { kind: check.kind, customer: Object.freeze({ ...customer, changeWrong }), check, diff: check.diff };
}

/**
 * The child presses "No change needed" (Hard, when the customer pays the exact total).
 * Right only if nothing is due; if change *is* due it counts as a wrong try, with the same retry limit as giving change.
 *
 * @param {Customer} customer
 * @returns {{ kind: 'exact'|'owed'|'failed', customer: Customer, due: number }}
 */
export function submitNoChange(customer) {
  expectPhase(customer, 'change');
  const due = customer.sale.changeDue;
  if (due === 0) return { kind: 'exact', customer: Object.freeze({ ...customer, phase: 'done', smart: true }), due };
  const changeWrong = customer.changeWrong + 1;
  if (changeWrong > MAX_CHANGE_RETRIES) {
    return { kind: 'failed', customer: Object.freeze({ ...customer, phase: 'done', changeWrong, failed: true }), due };
  }
  return { kind: 'owed', customer: Object.freeze({ ...customer, changeWrong }), due };
}

/**
 * How the sale went: right with no mistakes at all, right after some, or the answer had to be shown.
 * @param {Customer} customer
 * @returns {'first'|'retry'|'failed'}
 */
export function statusOf(customer) {
  if (customer.failed) return 'failed';
  return customer.totalWrong + customer.changeWrong === 0 ? 'first' : 'retry';
}
