import { el } from '../../../engine/utils/dom.js';
import { explainSplit } from '../logic/splits.js';
import { FACTS_PER_FLOOR } from '../logic/levels.js';

/**
 * The grid picture of a sum. A rectangle with `m` rows is cut into the parts of the table: 17 × 6 is a block of 10 columns
 * and a block of 7, each 6 rows tall, so (10 × 6) + (7 × 6) = 60 + 42 = 102 can be seen as well as read.
 * Choosing a number of rows redraws it.
 *
 * @param {{ table: number, start?: number }} options
 * @returns {{ el: HTMLElement }}
 */
export function createSplitGrid({ table, start = 6 }) {
  let m = Math.min(start, FACTS_PER_FLOOR);
  const stage = el('div', { class: 'sg__stage' });
  const working = el('p', { class: 'sg__working', attrs: { role: 'status' } });
  const chips = el('div', { class: 'sg__chips', attrs: { role: 'group', 'aria-label': `Times ${table} by` } });

  const draw = () => {
    const e = explainSplit(table, m);
    stage.replaceChildren(...e.parts.map((part, i) => el('div', {
      class: `sg__block sg__block--${i % 2}`, style: { '--cols': String(part.factor), '--rows': String(m), flex: `${part.factor} 1 0` },
      attrs: { role: 'img', 'aria-label': `${part.factor} by ${m} makes ${part.product}` },
    }, el('span', { class: 'sg__label' }, el('strong', { text: `${part.factor} × ${m}` }), ` = ${part.product}`))));
    stage.style.setProperty('--rows', String(m));
    working.textContent = e.parts.length === 1 ? `${e.text}. This one is quick to count, so there is nothing to split.` : e.text;
    for (const chip of chips.children) chip.setAttribute('aria-pressed', String(Number(chip.dataset.m) === m));
  };

  for (let i = 1; i <= FACTS_PER_FLOOR; i++) {
    chips.append(el('button', { class: 'chip', text: String(i), data: { m: String(i) }, attrs: { type: 'button', 'aria-label': `${table} times ${i}` }, on: { click: () => { m = i; draw(); } } }));
  }
  draw();
  return { el: el('div', { class: 'sg' }, el('p', { class: 'sg__ask', text: `Pick how many ${table}s:` }), chips, stage, working) };
}
