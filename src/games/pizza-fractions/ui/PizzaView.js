import { svgEl } from '../../../engine/utils/dom.js';
import { sliceAtPoint } from '../logic/pizza.js';
import { toppingById } from '../logic/toppings.js';
import { CRUST_RADIUS, VIEW_BOX, slicePath, toppingPieces } from './pizzaArt.js';

const NAV_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * The pizza the child decorates: one focusable button-like slice per slice of the pizza.
 *
 * A tap is turned into a slice by its angle from the centre (`sliceAtPoint`), so a tap on a border or on the crust
 * always lands on exactly one slice. Keyboard: arrows move between slices, Space or Enter toggles the topping.
 *
 * @param {{ slices: number, onToggle: (index: number) => void }} options
 * @returns {{
 *   el: HTMLElement,
 *   render: (pizza: (string|null)[], state?: { off?: readonly number[], locked?: boolean }) => void,
 *   focusSlice: (index: number) => void
 * }}
 */
export function createPizzaView({ slices, onToggle }) {
  let locked = false;

  // Roving tabindex: only one slice is a Tab stop, the arrow keys move between the rest.
  const slicesEls = Array.from({ length: slices }, (_, i) =>
    svgEl('g', { class: 'pizza__slice', role: 'button', tabindex: i === 0 ? 0 : -1, 'data-index': i },
      svgEl('path', { d: slicePath(i, slices), class: 'pizza__cheese' }),
      svgEl('g', { class: 'pizza__toppings' })));

  const svg = svgEl('svg', { viewBox: VIEW_BOX, class: 'pizza__svg', role: 'group', 'aria-label': `Pizza cut into ${slices} slices` },
    svgEl('circle', { r: CRUST_RADIUS, class: 'pizza__crust' }), ...slicesEls);
  const root = document.createElement('div');
  root.className = 'pizza';
  root.append(svg);

  const toggle = (index) => { if (!locked) onToggle(index); };

  root.addEventListener('click', (event) => {
    const box = svg.getBoundingClientRect();
    if (box.width === 0) return;
    const scale = box.width / 220; // the viewBox is 220 units wide
    const index = sliceAtPoint(event.clientX, event.clientY,
      { cx: box.left + box.width / 2, cy: box.top + box.height / 2, radius: CRUST_RADIUS * scale }, slices);
    if (index === null) return;
    focusSlice(index);
    toggle(index);
  });

  svg.addEventListener('keydown', (event) => {
    const index = slicesEls.indexOf(event.target);
    if (index < 0) return;
    if (event.key in NAV_KEYS) {
      event.preventDefault();
      focusSlice((index + NAV_KEYS[event.key] + slices) % slices);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle(index);
    }
  });

  function focusSlice(index) {
    slicesEls.forEach((node, i) => node.setAttribute('tabindex', i === index ? '0' : '-1'));
    slicesEls[index].focus({ preventScroll: true });
  }

  function render(pizza, { off = [], locked: isLocked = false } = {}) {
    locked = isLocked;
    const flagged = new Set(off);
    slicesEls.forEach((node, i) => {
      const topping = pizza[i];
      const holder = node.querySelector('.pizza__toppings');
      holder.replaceChildren(...(topping ? toppingPieces(topping, i, slices) : []));
      node.classList.toggle('is-off', flagged.has(i));
      node.setAttribute('aria-disabled', String(isLocked));
      node.setAttribute('aria-label', `Slice ${i + 1} of ${slices}: ${topping ? toppingById(topping).label : 'no topping'}${flagged.has(i) ? ', check this one' : ''}`);
    });
    svg.classList.toggle('is-locked', isLocked);
  }

  return { el: root, render, focusSlice };
}
