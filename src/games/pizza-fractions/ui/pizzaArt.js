import { svgEl } from '../../../engine/utils/dom.js';

/** The pizza is drawn in a 220 x 220 box centred on (0, 0); the crust reaches out to this radius. */
export const CRUST_RADIUS = 100;
export const VIEW_BOX = '-110 -110 220 220';
const CHEESE_RADIUS = 92;

/** A point at `radius` from the centre, `turns` of a full circle clockwise from 12 o'clock. */
const polar = (radius, turns) => {
  const angle = turns * 2 * Math.PI;
  return [radius * Math.sin(angle), -radius * Math.cos(angle)];
};

/**
 * The outline of slice `index` of `count`, as an SVG path. Slice 0 starts at 12 o'clock and they run clockwise,
 * the same convention `sliceAtPoint` uses to find the slice under a tap.
 */
export function slicePath(index, count, radius = CHEESE_RADIUS) {
  const [x1, y1] = polar(radius, index / count);
  const [x2, y2] = polar(radius, (index + 1) / count);
  // With 2 slices each is exactly half a circle; the arc is "small" (flag 0) because it is not *more* than half.
  return `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/**
 * Each topping has its own *shape* as well as its own colour, so a child who cannot tell the colours apart can still
 * tell pepperoni (spotted disc) from olive (ring), mushroom (cap and stem) and cheese (wedge).
 */
const GLYPHS = {
  pepperoni: () => [
    svgEl('circle', { r: 11, fill: '#c62828', stroke: '#6d0f0f', 'stroke-width': 2 }),
    svgEl('circle', { cx: -4, cy: -3, r: 1.8, fill: '#6d0f0f' }),
    svgEl('circle', { cx: 4, cy: 3, r: 1.8, fill: '#6d0f0f' }),
  ],
  olive: () => [
    svgEl('circle', { r: 8, fill: '#2f3b2f', stroke: '#111611', 'stroke-width': 2 }),
    svgEl('circle', { r: 3, fill: '#f8e3b0', stroke: '#111611', 'stroke-width': 1.5 }),
  ],
  mushroom: () => [
    svgEl('rect', { x: -3.5, y: 1, width: 7, height: 9, rx: 2, fill: '#f1e0cc', stroke: '#5a3d22', 'stroke-width': 2 }),
    svgEl('path', { d: 'M-11 3 A11 10 0 0 1 11 3 Z', fill: '#d9b99b', stroke: '#5a3d22', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
  ],
  cheese: () => [
    svgEl('path', { d: 'M-11 8 L0 -10 L11 8 Z', fill: '#ffd000', stroke: '#7a5c00', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    svgEl('circle', { cx: -2, cy: 2, r: 2, fill: '#b38f00' }),
    svgEl('circle', { cx: 4, cy: 5, r: 1.5, fill: '#b38f00' }),
  ],
};

/** Where the toppings sit in a slice: [distance from the centre as a share of the radius, how far across the slice]. */
const PLACEMENTS = {
  wide: [[0.4, 0.5], [0.65, 0.25], [0.65, 0.75], [0.86, 0.5]],
  medium: [[0.4, 0.5], [0.7, 0.28], [0.7, 0.72]],
  narrow: [[0.45, 0.5], [0.76, 0.5]],
};

/**
 * The topping pieces for one slice, scaled down on thin slices so they stay inside it.
 * @param {string} topping A key of GLYPHS.
 * @param {number} index
 * @param {number} count Slices on the pizza.
 * @returns {SVGElement[]}
 */
export function toppingPieces(topping, index, count) {
  const glyph = GLYPHS[topping];
  if (!glyph) return [];
  const spots = count <= 4 ? PLACEMENTS.wide : count <= 8 ? PLACEMENTS.medium : PLACEMENTS.narrow;
  return spots.map(([distance, across], i) => {
    const radius = distance * CHEESE_RADIUS;
    const [x, y] = polar(radius, (index + across) / count);
    const arc = (2 * Math.PI * radius) / count;
    const scale = Math.max(0.5, Math.min(1, arc / 28));
    return svgEl('g', { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(i * 67) % 360}) scale(${scale.toFixed(2)})` }, ...glyph());
  });
}
