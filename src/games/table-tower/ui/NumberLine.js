import { el, svgEl } from '../../../engine/utils/dom.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { skipCount } from '../logic/splits.js';

const WIDTH = 1000;
const LEFT = 36;
const RIGHT = 964;
const LINE_Y = 118;

/**
 * A number line from 0 to ten jumps of a table. The "Jump" button hops to the next multiple, drawing an arc labelled with
 * the size of the jump, so the table is seen as skip counting: 17, 34, 51 ...
 *
 * @param {{ table: number, onJump?: (landing: number, jumps: number) => void }} options
 * @returns {{ el: HTMLElement }}
 */
export function createNumberLine({ table, onJump }) {
  const multiples = skipCount(table);
  const end = multiples[multiples.length - 1];
  const x = (value) => LEFT + (value / end) * (RIGHT - LEFT);
  let jumps = 0;

  const arcs = svgEl('g', { class: 'nl__arcs' });
  const ticks = svgEl('g', { class: 'nl__ticks' });
  const frog = svgEl('text', { class: 'nl__frog', x: x(0), y: LINE_Y - 8, 'text-anchor': 'middle', 'aria-hidden': 'true' });
  frog.textContent = '🐸';
  const svg = svgEl('svg', { class: 'nl__svg', viewBox: `0 0 ${WIDTH} 170`, role: 'img', 'aria-label': `A number line with jumps of ${table}`, focusable: 'false' },
    svgEl('line', { class: 'nl__axis', x1: LEFT, y1: LINE_Y, x2: RIGHT, y2: LINE_Y }), ticks, arcs, frog);
  tick(0);

  function tick(value) {
    const t = svgEl('g', { class: 'nl__tick' },
      svgEl('line', { x1: x(value), y1: LINE_Y - 7, x2: x(value), y2: LINE_Y + 7 }));
    const label = svgEl('text', { x: x(value), y: LINE_Y + 34, 'text-anchor': 'middle' });
    label.textContent = String(value);
    t.append(label);
    ticks.append(t);
  }

  const status = el('p', { class: 'nl__status', attrs: { role: 'status' } });
  const jumpButton = createButton({ label: 'Jump', icon: '🐸', variant: 'primary', onClick: () => jump() });
  const againButton = createButton({ label: 'Start again', icon: '↺', onClick: () => reset() });

  function say() {
    status.textContent = jumps === 0
      ? `Start at 0. Each jump is ${table}.`
      : `${jumps} ${jumps === 1 ? 'jump' : 'jumps'} of ${table} land on ${multiples[jumps - 1]}. So ${jumps} × ${table} = ${multiples[jumps - 1]}.`;
  }

  function jump() {
    if (jumps >= multiples.length) return;
    const from = jumps === 0 ? 0 : multiples[jumps - 1];
    const to = multiples[jumps];
    jumps += 1;
    const mid = (x(from) + x(to)) / 2;
    const arc = svgEl('g', { class: 'nl__arc' },
      svgEl('path', { d: `M ${x(from)} ${LINE_Y - 12} Q ${mid} ${LINE_Y - 100} ${x(to)} ${LINE_Y - 12}` }));
    const label = svgEl('text', { x: mid, y: LINE_Y - 66, 'text-anchor': 'middle' });
    label.textContent = `+${table}`;
    arc.append(label);
    arcs.append(arc);
    tick(to);
    frog.setAttribute('x', String(x(to)));
    say();
    setDisabled(jumpButton, jumps >= multiples.length);
    onJump?.(to, jumps);
  }

  function reset() {
    jumps = 0;
    arcs.replaceChildren();
    ticks.replaceChildren();
    tick(0);
    frog.setAttribute('x', String(x(0)));
    setDisabled(jumpButton, false);
    say();
  }

  say();
  return { el: el('div', { class: 'nl' }, svg, status, el('div', { class: 'nl__buttons' }, jumpButton, againButton)) };
}
