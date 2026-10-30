import { svgEl } from '../../../engine/utils/dom.js';

let clipCount = 0;

/** Craters: the same few dents on Mercury and the Moon, in a darker shade of their own colour. */
const craters = (fill) => [
  svgEl('circle', { cx: -20, cy: -15, r: 8, fill }), svgEl('circle', { cx: 16, cy: 10, r: 11, fill }),
  svgEl('circle', { cx: -6, cy: 28, r: 6, fill }), svgEl('circle', { cx: 28, cy: -22, r: 5, fill }),
];
const band = (y, height, fill) => svgEl('rect', { x: -50, y, width: 100, height, fill });
const cloud = (d) => svgEl('path', { d, fill: 'none', stroke: '#f6dfaa', 'stroke-width': 8, 'stroke-linecap': 'round' });

/**
 * What is drawn on each body, clipped to its disc. Anything that is not here is a plain coloured ball, so a planet
 * added to the data file still shows up (just without markings).
 * `behind` and `front` are drawn outside the disc: the back and front halves of a ring, so the planet sits inside it.
 * @type {Record<string, { markings?: () => SVGElement[], ring?: { rx: number, ry: number, turn: number, stroke: string, width: number, front: string } }>}
 */
const ART = {
  mercury: { markings: () => craters('#8f8a82') },
  moon: { markings: () => craters('#a7a7a7') },
  venus: { markings: () => [cloud('M -50 -22 Q -25 -38 0 -22 T 50 -22'), cloud('M -50 8 Q -25 -8 0 8 T 50 8'), cloud('M -50 34 Q -25 18 0 34 T 50 34')] },
  earth: {
    markings: () => [
      svgEl('path', { d: 'M -32 -25 C -12 -42 10 -32 5 -10 C 0 6 -20 10 -37 0 Z', fill: '#4caf50' }),
      svgEl('path', { d: 'M 15 10 C 36 0 46 22 30 36 C 20 44 8 30 15 10 Z', fill: '#4caf50' }),
      svgEl('ellipse', { cx: -10, cy: 22, rx: 20, ry: 5, fill: '#ffffff', opacity: 0.75 }),
    ],
  },
  mars: {
    markings: () => [
      svgEl('ellipse', { cx: 0, cy: -48, rx: 24, ry: 11, fill: '#ffffff' }),
      svgEl('ellipse', { cx: -10, cy: 6, rx: 20, ry: 9, fill: '#a8401f' }), svgEl('ellipse', { cx: 22, cy: -10, rx: 11, ry: 6, fill: '#a8401f' }),
    ],
  },
  jupiter: {
    markings: () => [band(-40, 12, '#b87d4b'), band(-16, 10, '#f0d9b5'), band(4, 14, '#b87d4b'), band(28, 10, '#efd5ae'),
      svgEl('ellipse', { cx: 18, cy: 16, rx: 12, ry: 7, fill: '#c0452c' })],
  },
  saturn: {
    markings: () => [band(-28, 10, '#c9a95a'), band(2, 8, '#d9bf7a'), band(24, 8, '#c9a95a')],
    ring: { rx: 84, ry: 20, turn: -18, stroke: '#b69a50', width: 8, front: 'M -84 0 A 84 20 0 0 0 84 0' },
  },
  uranus: {
    markings: () => [band(-6, 8, '#b5e5e8')],
    // Uranus spins on its side, so its thin ring stands up instead of lying flat.
    ring: { rx: 14, ry: 74, turn: 8, stroke: '#bfe9ec', width: 5, front: 'M 0 -74 A 14 74 0 0 1 0 74' },
  },
  neptune: {
    markings: () => [svgEl('ellipse', { cx: -12, cy: -8, rx: 13, ry: 7, fill: '#26398a' }),
      svgEl('path', { d: 'M 6 26 Q 24 18 40 24', fill: 'none', stroke: '#ffffff', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.6 })],
  },
};

/**
 * A planet (or the Moon) as a small SVG picture, sized by `diameter`. Rings may stick out past the size on purpose.
 *
 * @param {{ id: string, color: string }} body
 * @param {{ diameter?: number, label?: string|null }} [options] `label` makes it an image with that description; without
 *   one it is hidden from screen readers (the name is written next to it).
 * @returns {SVGSVGElement}
 */
export function createPlanetArt(body, { diameter = 64, label = null } = {}) {
  const art = ART[body.id] ?? {};
  const clipId = `planet-clip-${++clipCount}`;
  const svg = svgEl('svg', { class: `planet planet--${body.id}`, viewBox: '-50 -50 100 100', width: diameter, height: diameter, focusable: 'false' });
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');

  const ringAttrs = art.ring && { fill: 'none', stroke: art.ring.stroke, 'stroke-width': art.ring.width, transform: `rotate(${art.ring.turn})` };
  if (art.ring) svg.append(svgEl('ellipse', { class: 'planet__ring', rx: art.ring.rx, ry: art.ring.ry, ...ringAttrs }));

  svg.append(
    svgEl('clipPath', { id: clipId }, svgEl('circle', { r: 50 })),
    svgEl('circle', { class: 'planet__disc', r: 50, fill: body.color }),
    svgEl('g', { 'clip-path': `url(#${clipId})` }, ...(art.markings?.() ?? [])),
    svgEl('circle', { class: 'planet__outline', r: 50, fill: 'none' }),
  );
  if (art.ring) svg.append(svgEl('path', { class: 'planet__ring', d: art.ring.front, ...ringAttrs }));
  return svg;
}

/** The Sun, with rays, at the start of the line-up. Decorative. @param {number} [diameter] @returns {SVGSVGElement} */
export function createSunArt(diameter = 72) {
  const svg = svgEl('svg', { class: 'sun-art', viewBox: '-60 -60 120 120', width: diameter, height: diameter, 'aria-hidden': 'true', focusable: 'false' });
  for (let i = 0; i < 12; i++) {
    svg.append(svgEl('line', { x1: 0, y1: -46, x2: 0, y2: -58, class: 'sun-art__ray', transform: `rotate(${i * 30})` }));
  }
  svg.append(svgEl('circle', { r: 40, class: 'sun-art__disc' }));
  return svg;
}
