import { el } from '../../../engine/utils/dom.js';
import { explainSplit } from '../logic/splits.js';
import { FACTS_PER_FLOOR } from '../logic/levels.js';

/**
 * The flat picture of a split sum: coloured blocks side by side, as wide as each part and as tall as the number of rows.
 * The grid hands it a new working each time the child picks a number of rows.
 *
 * @returns {{ el: HTMLElement, show: (explained: ReturnType<typeof explainSplit>, rows: number) => void }}
 */
export function createBlockStage() {
  const stage = el('div', { class: 'sg__stage' });
  return {
    el: stage,
    show(explained, rows) {
      stage.replaceChildren(...explained.parts.map((part, i) => el('div', {
        class: `sg__block sg__block--${i % 2}`, style: { '--cols': String(part.factor), '--rows': String(rows), flex: `${part.factor} 1 0` },
        attrs: { role: 'img', 'aria-label': `${part.factor} by ${rows} makes ${part.product}` },
      }, el('span', { class: 'sg__label' }, el('strong', { text: `${part.factor} × ${rows}` }), ` = ${part.product}`))));
      stage.style.setProperty('--rows', String(rows));
    },
  };
}

/**
 * The grid picture of a sum. A rectangle with `m` rows is cut into the parts of the table: 17 × 6 is a block of 10 columns
 * and a block of 7, each 6 rows tall, so (10 × 6) + (7 × 6) = 60 + 42 = 102 can be seen as well as read.
 * Choosing a number of rows redraws it.
 *
 * The picture itself is a `stage` (`createBlockStage` by default), so the 3D version can show the same sum as 3D slabs while
 * the choosing of rows and the written working stay exactly as they are.
 *
 * @param {{ table: number, start?: number, createStage?: () => ReturnType<typeof createBlockStage> }} options
 * @returns {{ el: HTMLElement, stage: ReturnType<typeof createBlockStage> }} `stage` is what was drawn with, so a 3D one can be
 *   updated, rendered and freed by its scene.
 */
export function createSplitGrid({ table, start = 6, createStage = createBlockStage }) {
  let m = Math.min(start, FACTS_PER_FLOOR);
  const view = createStage();
  const working = el('p', { class: 'sg__working', attrs: { role: 'status' } });
  const chips = el('div', { class: 'sg__chips', attrs: { role: 'group', 'aria-label': `Times ${table} by` } });

  const draw = () => {
    const e = explainSplit(table, m);
    view.show(e, m);
    working.textContent = e.parts.length === 1 ? `${e.text}. This one is quick to count, so there is nothing to split.` : e.text;
    for (const chip of chips.children) chip.setAttribute('aria-pressed', String(Number(chip.dataset.m) === m));
  };

  for (let i = 1; i <= FACTS_PER_FLOOR; i++) {
    chips.append(el('button', { class: 'chip', text: String(i), data: { m: String(i) }, attrs: { type: 'button', 'aria-label': `${table} times ${i}` }, on: { click: () => { m = i; draw(); } } }));
  }
  draw();
  return { el: el('div', { class: 'sg' }, el('p', { class: 'sg__ask', text: `Pick how many ${table}s:` }), chips, view.el, working), stage: view };
}
