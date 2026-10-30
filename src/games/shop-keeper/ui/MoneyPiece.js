import { el } from '../../../engine/utils/dom.js';
import { formatMoney } from '../logic/currency.js';

/**
 * One coin or note. Coins are round and notes are wide rectangles, and the value is written on each, so the piece
 * is recognisable by shape and number, not by its colour.
 *
 * @param {import('../logic/currency.js').Denomination} denomination
 * @param {import('../logic/currency.js').Currency} currency
 * @param {{ tag?: 'button'|'div', ariaLabel?: string }} [options] Use `div` for pieces that are only shown, such as
 *   the customer's payment; pieces the child can use are `button`s.
 * @returns {HTMLElement}
 */
export function createPiece(denomination, currency, { tag = 'button', ariaLabel } = {}) {
  const label = ariaLabel ?? `${formatMoney(denomination.value, currency)} ${denomination.kind}`;
  return el(tag, {
    class: `piece piece--${denomination.kind}`,
    attrs: { ...(tag === 'button' ? { type: 'button' } : { role: 'img' }), 'aria-label': label, title: label },
    style: { '--piece-color': denomination.color },
  }, el('span', { class: 'piece__value', text: formatMoney(denomination.value, currency), attrs: { 'aria-hidden': 'true' } }));
}
