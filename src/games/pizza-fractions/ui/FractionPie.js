import { svgEl } from '../../../engine/utils/dom.js';
import { toppingById } from '../logic/toppings.js';
import { slicesFor } from '../logic/fraction.js';
import { VIEW_BOX, slicePath, toppingPieces } from './pizzaArt.js';

/**
 * A small picture of an order: the pizza cut into `slices`, with the ordered number of slices topped. Used in the
 * customer's thought bubble after a wrong serve, so the child can *see* what the fraction means. Decorative: the
 * text next to it ("3/8 pepperoni") says the same thing.
 *
 * @param {{ slices: number, lines: readonly import('../logic/orderGenerator.js').OrderLine[] }} order
 * @returns {SVGElement}
 */
export function createFractionPie({ slices, lines }) {
  // Toppings fill consecutive slices from the top, one line after the other.
  const fill = [];
  for (const line of lines) {
    const needed = slicesFor(line.amount, slices) ?? 0;
    for (let i = 0; i < needed; i++) fill.push(line.topping);
  }
  const parts = Array.from({ length: slices }, (_, i) => svgEl('g', {},
    svgEl('path', { d: slicePath(i, slices), class: 'pizza__cheese' }),
    ...(fill[i] ? toppingPieces(fill[i], i, slices) : [])));
  return svgEl('svg', { viewBox: VIEW_BOX, class: 'pie', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('circle', { r: 100, class: 'pizza__crust' }), ...parts);
}

/** A readable name for what an order line asks for, e.g. "3/8 Pepperoni". */
export const describeLine = (line) => `${line.amount.num}/${line.amount.den} ${toppingById(line.topping).label}`;
