import { svgEl } from '../../../engine/utils/dom.js';
import { COLORS } from '../logic/generators/helpers.js';

const INK = '#1f2544';
let patternCounter = 0;

/**
 * Every colour also gets its own pattern drawn over the shape, so a child who cannot tell two colours apart can still
 * tell the items apart (the spec asks that shapes differ by more than colour). Yellow is left plain.
 * Each entry draws the marks of a pattern tile that is 12 units wide and tall.
 */
const MARKS = {
  orange: () => [svgEl('circle', { cx: 6, cy: 6, r: 2.4, fill: INK })],
  sky: () => [svgEl('path', { d: 'M0 6H12', stroke: INK, 'stroke-width': 2.4 })],
  green: () => [svgEl('path', { d: 'M-2 14L14 -2', stroke: INK, 'stroke-width': 2.4 })],
  yellow: () => [],
  blue: () => [svgEl('path', { d: 'M6 0V12M0 6H12', stroke: INK, 'stroke-width': 2 })],
  red: () => [svgEl('path', { d: 'M6 0V12', stroke: INK, 'stroke-width': 2.6 })],
  purple: () => [svgEl('path', { d: 'M-2 -2L14 14', stroke: INK, 'stroke-width': 2.4 })],
};

/** The outline of each shape, drawn about (0, 0) in a 100 x 100 cell. */
function outline(shape, attrs) {
  switch (shape) {
    case 'circle': return svgEl('circle', { cx: 0, cy: 0, r: 34, ...attrs });
    case 'square': return svgEl('rect', { x: -32, y: -32, width: 64, height: 64, rx: 8, ...attrs });
    case 'triangle': return svgEl('polygon', { points: '0,-38 36,30 -36,30', 'stroke-linejoin': 'round', ...attrs });
    case 'star': return svgEl('polygon', { points: starPoints(), 'stroke-linejoin': 'round', ...attrs });
    case 'arrow': return svgEl('path', { d: 'M0 -40 L30 -6 H12 V38 H-12 V-6 H-30 Z', 'stroke-linejoin': 'round', ...attrs });
    default: return svgEl('circle', { cx: 0, cy: 0, r: 30, ...attrs });
  }
}

function starPoints() {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 40 : 17;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
}

/** One shape with its colour, pattern and outline, centred on (0, 0). */
function drawShape(token, patternId) {
  const colour = COLORS[token.color] ?? '#cccccc';
  const group = svgEl('g', {}, outline(token.shape, { fill: colour, stroke: INK, 'stroke-width': 5 }));
  group.append(outline(token.shape, { fill: `url(#${patternId})`, stroke: 'none' }));
  if (token.shape === 'arrow') group.setAttribute('transform', `rotate(${token.rotation ?? 0})`);
  return group;
}

/**
 * A token as an SVG picture. A token with `count` above 1 is a group: that many of the shape side by side (in two rows
 * once there are more than four), scaled to fit.
 *
 * @param {import('../logic/equality.js').Token} token
 * @returns {SVGSVGElement}
 */
export function createTokenSvg(token) {
  const id = `tp${patternCounter++}`;
  const count = token.count ?? 1;
  const cols = count <= 4 ? count : Math.ceil(count / 2);
  const rows = count <= 4 ? 1 : 2;
  const cell = Math.min(100 / cols, 100 / rows);
  const scale = (cell / 100) * (count === 1 ? 1 : 0.95);

  const pattern = svgEl('pattern', { id, width: 12, height: 12, patternUnits: 'userSpaceOnUse' }, ...(MARKS[token.color]?.() ?? []));
  const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'token', 'aria-hidden': 'true', focusable: 'false' }, svgEl('defs', {}, pattern));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (100 / cols) * (col + 0.5);
    const y = (100 / rows) * (row + 0.5);
    const g = svgEl('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})` }, drawShape(token, id));
    svg.append(g);
  }
  return svg;
}
