import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { formatMoney } from '../logic/currency.js';

/**
 * The counter: the customer's items with their price tags, and the till.
 * Easy shows the total. Medium and Hard show a number box where the child types the total they added up.
 *
 * @param {{
 *   sale: import('../logic/saleGenerator.js').Sale,
 *   currency: import('../logic/currency.js').Currency,
 *   showTotal: boolean,
 *   onSubmitTotal: (typed: string) => void
 * }} options
 * @returns {{
 *   el: HTMLElement,
 *   focusInput: () => void,
 *   setTotalMessage: (text: string) => void,
 *   confirmTotal: (total: number) => void
 * }}
 */
export function createCounter({ sale, currency, showTotal, onSubmitTotal }) {
  const money = (n) => formatMoney(n, currency);
  const items = el('ul', { class: 'counter__items' }, ...sale.items.map((item) => el('li', {
    class: 'item', attrs: { 'aria-label': `${item.name}, ${money(item.price)}` },
  }, el('span', { class: 'item__icon', text: item.icon, attrs: { 'aria-hidden': 'true' } }),
  el('span', { class: 'item__name', text: item.name, attrs: { 'aria-hidden': 'true' } }),
  el('span', { class: 'item__price', text: money(item.price), attrs: { 'aria-hidden': 'true' } }))));

  const till = el('div', { class: 'till' });
  const message = el('p', { class: 'till__message', attrs: { role: 'status' } });
  /** @type {HTMLInputElement|null} */
  let input = null;

  const showFixedTotal = (total) => {
    till.replaceChildren(el('p', { class: 'till__total' }, el('span', { text: 'Total ' }), el('strong', { text: money(total) })));
  };

  if (showTotal) {
    showFixedTotal(sale.total);
  } else {
    const submit = () => onSubmitTotal(input.value);
    input = el('input', {
      class: 'till__input',
      attrs: { id: 'till-total', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', maxlength: 6, 'aria-describedby': 'till-help' },
      on: { keydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } } },
    });
    till.append(
      el('label', { class: 'till__label', attrs: { for: 'till-total' }, text: `Add up the prices. What is the total (${currency.symbol})?` }),
      el('div', { class: 'till__entry' }, el('span', { class: 'till__symbol', text: currency.symbol, attrs: { 'aria-hidden': 'true' } }), input,
        createButton({ label: 'Check total', variant: 'primary', onClick: submit })),
      el('p', { class: 'till__help', attrs: { id: 'till-help' }, text: 'Type the number and press Enter or "Check total".' }));
  }
  till.append(message);

  return {
    el: el('section', { class: 'counter', attrs: { 'aria-label': 'Counter' } }, items, till),
    focusInput: () => input?.focus(),
    setTotalMessage: (text) => { message.textContent = text; },
    /** The total is known now (typed correctly, or revealed after three misses): show it as the fixed total. */
    confirmTotal: (total) => { showFixedTotal(total); till.append(message); },
  };
}
