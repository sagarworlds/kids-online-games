import { checkOrder } from './orderChecker.js';
import { isEmpty } from './pizza.js';
import { MAX_RETRIES } from './levels.js';

/**
 * @typedef {import('./orderGenerator.js').Order} Order
 * @typedef {{ order: Order, wrong: number }} Attempt  `wrong` counts the serves already rejected for this customer.
 * @typedef {{
 *   kind: 'empty'|'correct'|'wrong'|'failed',
 *   attempt: Attempt,
 *   status?: import('./scoring.js').OrderStatus,
 *   retriesLeft?: number,
 *   result?: import('./orderChecker.js').CheckResult
 * }} ServeOutcome
 */

/** @param {Order} order @returns {Attempt} */
export const newAttempt = (order) => Object.freeze({ order, wrong: 0 });

/**
 * What happens when the child presses Serve.
 *
 * - `empty`: nothing on the pizza, so the serve is blocked and does not use up a try.
 * - `correct`: first try counts as `first`, any later try as `retry` (fewer coins).
 * - `wrong`: the customer gives a hint and the child may fix the pizza (up to MAX_RETRIES retries).
 * - `failed`: the last retry was also wrong, so the customer leaves and the order scores nothing.
 *
 * @param {Attempt} attempt
 * @param {import('./pizza.js').PizzaState} pizza
 * @returns {ServeOutcome}
 */
export function serve(attempt, pizza) {
  if (isEmpty(pizza)) return { kind: 'empty', attempt };
  const result = checkOrder(attempt.order, pizza);
  if (result.ok) return { kind: 'correct', attempt, status: attempt.wrong === 0 ? 'first' : 'retry', result };
  const next = Object.freeze({ order: attempt.order, wrong: attempt.wrong + 1 });
  if (next.wrong > MAX_RETRIES) return { kind: 'failed', attempt: next, status: 'failed', result };
  return { kind: 'wrong', attempt: next, retriesLeft: MAX_RETRIES - next.wrong + 1, result };
}
