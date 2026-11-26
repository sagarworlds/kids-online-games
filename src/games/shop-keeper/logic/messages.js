import { formatMoney } from './currency.js';
import { discountLine } from './sale.js';

/**
 * Feedback sentences. Money is formatted through the currency, so a new currency file changes every message too.
 * Each message says the exact difference, as the spec asks ("You gave ₹5 too much").
 */

/**
 * @param {{ kind: 'empty'|'tooMuch'|'tooLittle'|'failed', diff: number, check?: { kind: string } }} result
 * @param {import('./currency.js').Currency} currency
 * @param {{ noChangeButton: boolean }} level
 * @returns {string}
 */
export function changeMessage(result, currency, level) {
  const money = (n) => formatMoney(n, currency);
  const kind = result.kind === 'failed' ? result.check.kind : result.kind;
  if (kind === 'empty') return level.noChangeButton ? 'Put some money in the tray first, or tap "No change needed".' : 'Put some money in the tray first.';
  if (kind === 'tooMuch') return `You gave ${money(result.diff)} too much.`;
  return `The customer needs ${money(result.diff)} more.`;
}

/**
 * The total (on Sale day, the bill: the prices after their discounts) the child typed was right.
 * @param {{ saleDay?: boolean }} sale
 * @returns {string}
 */
export const totalRightMessage = (sale) => `Yes! That is the ${sale.saleDay ? 'bill' : 'total'}. Now give the change.`;

/**
 * @param {'wrong'|'revealed'} kind
 * @param {{ items: { name?: string, icon?: string, price: number, sale?: import('./sale.js').Discount }[], total: number, saleDay?: boolean }} sale
 * @param {number} wrongCount
 * @param {import('./currency.js').Currency} currency
 * @returns {string}
 */
export function totalMessage(kind, sale, wrongCount, currency) {
  const money = (n) => formatMoney(n, currency);
  if (kind === 'revealed') return `The ${sale.saleDay ? 'bill' : 'total'} is ${money(sale.total)}. Now give the change.`;
  if (sale.saleDay) {
    if (wrongCount === 1) return 'Not quite. Take the discount off each price tag first, then add up what is left.';
    // Second miss: work the first tag out for them.
    return `Not quite. Start with the first one: ${discountLine(sale.items[0], currency)}`;
  }
  if (wrongCount === 1) return 'Not quite. Add up all the price tags again.';
  // Second miss: do the first step of the sum for them.
  const [a, b] = sale.items;
  return `Not quite. Start with the first two: ${money(a.price)} + ${money(b.price)} = ${money(a.price + b.price)}.`;
}
