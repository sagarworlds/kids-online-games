import { el } from '../../../engine/utils/dom.js';
import { toppingById } from '../logic/toppings.js';
import { describeLine } from './FractionPie.js';

/**
 * A fraction written the way it is taught: numerator over denominator, with a bar between.
 * @param {import('../logic/fraction.js').Fraction} fraction
 * @returns {HTMLElement}
 */
export function createFractionEl({ num, den }) {
  return el('span', { class: 'frac', attrs: { role: 'img', 'aria-label': `${num} over ${den}` } },
    el('span', { class: 'frac__num', text: String(num), attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'frac__bar', attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'frac__den', text: String(den), attrs: { 'aria-hidden': 'true' } }));
}

/**
 * The customer's order ticket: one big stacked fraction and the topping for each line of the order.
 * @param {import('../logic/orderGenerator.js').Order} order
 * @returns {HTMLElement}
 */
export function createOrderTicket(order) {
  const lines = order.lines.map((line) => {
    const topping = toppingById(line.topping);
    return el('li', { class: 'ticket__line', attrs: { 'aria-label': describeLine(line) } },
      createFractionEl(line.amount),
      el('span', { class: 'ticket__topping', attrs: { 'aria-hidden': 'true' } },
        el('span', { class: 'ticket__icon', text: topping.icon }), el('span', { text: topping.label })));
  });
  return el('div', { class: 'ticket' },
    el('h2', { class: 'ticket__title', text: `${order.customer}'s order` }),
    el('ul', { class: 'ticket__lines' }, ...lines),
    el('p', { class: 'ticket__cut', text: `Pizza cut into ${order.slices} slices` }));
}
