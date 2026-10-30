import { svgEl } from '../../../engine/utils/dom.js';

/** The soil is at y = 200 in a 200 x 260 picture; every plant grows up from the middle of it. */
const SOIL_Y = 200;
/** How tall the main stem is at each stage (0 = seed), as a share of its full height. */
const GROWTH = Object.freeze([0, 0.26, 0.44, 0.62, 0.8, 1, 1, 1]);

const ellipse = (cx, cy, rx, ry, attrs = {}) => svgEl('ellipse', { cx, cy, rx, ry, ...attrs });
const circle = (cx, cy, r, attrs = {}) => svgEl('circle', { cx, cy, r, ...attrs });
const path = (d, attrs = {}) => svgEl('path', { d, ...attrs });
const leaf = (x, y, turn, fill = '#4caf50', size = 1) => ellipse(x, y, 20 * size, 8 * size, { fill, transform: `rotate(${turn} ${x} ${y})`, class: 'leaf' });
const petals = (cx, cy, count, rx, ry, reach, fill) => Array.from({ length: count }, (_, i) => ellipse(cx, cy - reach, rx, ry, { fill, transform: `rotate(${(360 / count) * i} ${cx} ${cy})`, class: 'petal' }));

/**
 * Each plant is a list of parts. A part appears when the plant reaches stage `at` (and goes again at `until`, for a
 * seed that becomes a sprout). `stem` is the main stem or body, which grows taller with each stage instead.
 * Everything is plain SVG shapes, so the pictures need no files, and the growth is CSS transitions on opacity and scale.
 *
 * @type {Record<string, { stem: SVGElement, parts: { at: number, until?: number, node: SVGElement }[] }>}
 */
const ARTISTS = {
  sunflower: () => ({
    stem: svgEl('rect', { x: 95, y: 55, width: 10, height: 145, rx: 4, fill: '#4c9a2a', class: 'stem' }),
    parts: [
      { at: 0, until: 1, node: ellipse(100, SOIL_Y - 3, 8, 5, { fill: '#6b4423' }) },
      { at: 1, node: svgEl('g', {}, leaf(86, 186, -35, '#6dbb45', 0.85), leaf(114, 186, 35, '#6dbb45', 0.85)) },
      { at: 2, node: svgEl('g', {}, leaf(82, 168, -25), leaf(118, 168, 25)) },
      { at: 3, node: svgEl('g', {}, leaf(80, 140, -20, '#4caf50', 1.2), leaf(120, 140, 20, '#4caf50', 1.2)) },
      { at: 4, node: svgEl('g', {}, leaf(82, 112, -25, '#43a047', 1.1), leaf(118, 112, 25, '#43a047', 1.1)) },
      { at: 5, until: 6, node: svgEl('g', {}, circle(100, 55, 15, { fill: '#5aa832' }), ellipse(100, 44, 6, 9, { fill: '#4c9a2a' })) },
      { at: 6, node: svgEl('g', {}, ...petals(100, 52, 14, 8, 17, 24, '#ffd23f'), circle(100, 52, 20, { fill: '#7a4a21' })) },
      { at: 7, node: svgEl('g', {}, ...[[-8, -6], [8, -6], [0, 2], [-9, 8], [9, 8], [0, -14], [0, 14]].map(([dx, dy]) => circle(100 + dx, 52 + dy, 2.6, { fill: '#3e2511' }))) },
    ],
  }),
  cactus: () => ({
    stem: svgEl('rect', { x: 80, y: 85, width: 40, height: 115, rx: 20, fill: '#3f9b55', class: 'stem' }),
    parts: [
      { at: 0, until: 1, node: ellipse(100, SOIL_Y - 3, 8, 5, { fill: '#6b4423' }) },
      { at: 2, node: svgEl('g', {}, ...[[92, 160], [108, 150], [92, 130], [108, 120], [96, 105]].map(([x, y]) => svgEl('path', { d: `M ${x - 3} ${y} l 6 -4 M ${x - 3} ${y - 4} l 6 4`, stroke: '#e8f5e9', 'stroke-width': 1.5, fill: 'none' }))) },
      { at: 4, node: svgEl('g', {}, path('M 80 150 q -28 0 -28 -26 l 0 -18', { fill: 'none', stroke: '#3f9b55', 'stroke-width': 17, 'stroke-linecap': 'round' })) },
      { at: 5, node: svgEl('g', {}, path('M 120 138 q 28 0 28 -26 l 0 -18', { fill: 'none', stroke: '#3f9b55', 'stroke-width': 17, 'stroke-linecap': 'round' })) },
      { at: 6, node: svgEl('g', {}, ...petals(100, 82, 8, 5, 10, 12, '#ff80ab'), circle(100, 82, 6, { fill: '#ffeb3b' })) },
      { at: 7, node: svgEl('g', {}, circle(52, 92, 6, { fill: '#e53935' }), circle(148, 82, 6, { fill: '#e53935' }), circle(100, 66, 6, { fill: '#e53935' })) },
    ],
  }),
  tomato: () => ({
    stem: svgEl('rect', { x: 96, y: 60, width: 8, height: 140, rx: 4, fill: '#5d8f2a', class: 'stem' }),
    parts: [
      { at: 0, until: 1, node: ellipse(100, SOIL_Y - 3, 8, 5, { fill: '#6b4423' }) },
      { at: 1, node: svgEl('g', {}, leaf(86, 186, -35, '#7cb342', 0.85), leaf(114, 186, 35, '#7cb342', 0.85)) },
      { at: 2, node: svgEl('g', {}, leaf(80, 165, -30, '#689f38', 0.9), leaf(120, 165, 30, '#689f38', 0.9)) },
      { at: 3, node: svgEl('g', {}, leaf(78, 135, -25, '#7cb342', 1), leaf(122, 135, 25, '#7cb342', 1)) },
      { at: 4, node: svgEl('g', {}, leaf(80, 105, -25, '#689f38', 1.1), leaf(120, 105, 25, '#689f38', 1.1), leaf(100, 72, 0, '#7cb342', 0.8)) },
      { at: 5, until: 6, node: svgEl('g', {}, ...[[72, 150], [128, 120], [74, 100]].map(([x, y]) => svgEl('g', {}, ...petals(x, y, 5, 3, 6, 7, '#fdd835'), circle(x, y, 3, { fill: '#f9a825' })))) },
      { at: 6, until: 7, node: svgEl('g', {}, ...[[70, 160], [130, 135], [72, 112]].map(([x, y]) => circle(x, y, 9, { fill: '#8bc34a', stroke: '#558b2f', 'stroke-width': 1.5 }))) },
      { at: 7, node: svgEl('g', {}, ...[[70, 160], [130, 135], [72, 112], [118, 170]].map(([x, y]) => svgEl('g', {}, circle(x, y, 12, { fill: '#e53935', stroke: '#b71c1c', 'stroke-width': 1.5 }), ellipse(x, y - 11, 6, 3, { fill: '#4caf50' })))) },
    ],
  }),
  rice: () => ({
    // The body of rice is a clump of thin stalks; the "stem" is the middle one.
    stem: svgEl('path', { d: 'M 100 200 C 100 150 98 100 102 50', fill: 'none', stroke: '#7cb342', 'stroke-width': 6, 'stroke-linecap': 'round', class: 'stem' }),
    parts: [
      { at: 0, until: 1, node: svgEl('g', {}, ...[88, 100, 112].map((x) => ellipse(x, SOIL_Y - 3, 5, 3, { fill: '#e9d9a5' }))) },
      { at: 3, node: svgEl('g', {}, path('M 92 200 C 80 160 70 130 62 100', { fill: 'none', stroke: '#8bc34a', 'stroke-width': 5, 'stroke-linecap': 'round' }), path('M 108 200 C 120 160 130 130 138 100', { fill: 'none', stroke: '#8bc34a', 'stroke-width': 5, 'stroke-linecap': 'round' })) },
      { at: 2, node: svgEl('g', {}, leaf(84, 175, -50, '#9ccc65', 0.8), leaf(116, 175, 50, '#9ccc65', 0.8)) },
      { at: 4, node: svgEl('g', {}, leaf(76, 140, -55, '#8bc34a', 1.1), leaf(124, 140, 55, '#8bc34a', 1.1)) },
      { at: 5, until: 6, node: svgEl('g', {}, ...[[102, 52], [62, 102], [138, 102]].map(([x, y]) => ellipse(x, y - 4, 3, 9, { fill: '#c5e1a5' }))) },
      { at: 6, until: 7, node: svgEl('g', {}, ...[[102, 52], [62, 102], [138, 102]].map(([x, y]) => svgEl('g', {}, ellipse(x, y - 4, 4, 11, { fill: '#aed581' }), ellipse(x + 5, y + 6, 3, 8, { fill: '#aed581' })))) },
      { at: 7, node: svgEl('g', {}, ...[[102, 52, 1], [62, 102, -1], [138, 102, 1]].map(([x, y, side]) => path(`M ${x} ${y} q ${14 * side} 4 ${14 * side} 26`, { fill: 'none', stroke: '#f9c846', 'stroke-width': 9, 'stroke-linecap': 'round' }))) },
    ],
  }),
};

/** A plant without its own drawing (one added to the data file) is a plain green stem, so the game still works. */
const FALLBACK = () => ({ stem: svgEl('rect', { x: 95, y: 70, width: 10, height: 130, rx: 4, fill: '#4c9a2a', class: 'stem' }), parts: [] });

const MOUTHS = Object.freeze({ happy: 'M 82 232 Q 100 248 118 232', ok: 'M 86 238 L 114 238', wilting: 'M 84 242 Q 100 228 116 242' });

/**
 * The plant in its pot, as SVG. `update` sets the growth stage, how the plant feels, and what is bothering it; the change
 * between two states is animated by CSS (stems grow, leaves unfold, the plant droops or sways), and switched off for the
 * little pictures in the journal.
 *
 * Feelings: a happy plant sways and its pot smiles; a wilting one droops and frowns; a thirsty one droops a little; too
 * much water shows a puddle; too much sun shows sweat drops; too much fertiliser browns the leaves; not enough sun dims it.
 *
 * @param {{ id: string }} plant
 * @param {{ size?: number, label?: string|null }} [options] `label` makes it an image with that description.
 * @returns {{ el: SVGSVGElement, update: (look: { stage: number, mood: 'happy'|'ok'|'wilting', problem?: string|null }, options?: { animate?: boolean }) => void }}
 */
export function createPlantArt(plant, { size = 220, label = null } = {}) {
  const artist = (ARTISTS[plant.id] ?? FALLBACK)();
  const svg = svgEl('svg', { class: 'plantart', viewBox: '0 0 200 260', width: size, height: (size * 260) / 200, focusable: 'false' });
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');

  const stem = artist.stem;
  const parts = artist.parts.map((p) => {
    const g = svgEl('g', { class: 'part' }, p.node);
    return { ...p, g };
  });
  const body = svgEl('g', { class: 'plantbody' }, stem, ...parts.map((p) => p.g));
  const drops = svgEl('g', { class: 'sweat' }, ...[[70, 70], [132, 60], [60, 110]].map(([x, y], i) => path(`M ${x} ${y} q 6 10 0 14 q -6 -4 0 -14 z`, { fill: '#4fc3f7', class: `sweat__drop sweat__drop--${i}` })));
  const face = svgEl('g', { class: 'potface' }, circle(88, 222, 3.5, { fill: '#3e2511' }), circle(112, 222, 3.5, { fill: '#3e2511' }), path(MOUTHS.ok, { class: 'potface__mouth', fill: 'none', stroke: '#3e2511', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  const mouth = face.querySelector('.potface__mouth');

  svg.append(
    ellipse(100, 254, 62, 6, { fill: 'rgba(0,0,0,0.12)' }),
    body, drops,
    path('M 52 204 L 148 204 L 138 252 L 62 252 Z', { fill: '#b5651d', stroke: '#1f2544', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
    svgEl('rect', { x: 44, y: 196, width: 112, height: 16, rx: 6, fill: '#c97a30', stroke: '#1f2544', 'stroke-width': 3 }),
    face,
    // The puddle is drawn last so it shows in front of the pot's base.
    svgEl('g', { class: 'puddle' }, ellipse(100, 254, 92, 9, { fill: '#1e88e5', stroke: '#0d47a1', 'stroke-width': 2 }), ellipse(78, 252, 22, 3, { fill: '#bbdefb' })),
  );

  function update({ stage, mood, problem = null }, { animate = true } = {}) {
    svg.classList.toggle('no-anim', !animate);
    const index = Math.min(GROWTH.length - 1, Math.max(0, stage));
    stem.style.transformOrigin = `100px ${SOIL_Y}px`;
    stem.style.transform = `scaleY(${Math.max(GROWTH[index], 0.001)})`;
    stem.style.opacity = index === 0 ? '0' : '1';
    for (const p of parts) p.g.classList.toggle('is-grown', index >= p.at && (p.until === undefined || index < p.until));
    mouth.setAttribute('d', MOUTHS[mood]);
    svg.classList.remove('is-happy', 'is-ok', 'is-wilting');
    svg.classList.add(`is-${mood}`);
    for (const name of ['thirsty', 'puddle', 'shady', 'sweaty', 'hungry', 'burnt']) svg.classList.toggle(`has-${name}`, problem === name);
  }
  update({ stage: 0, mood: 'happy' }, { animate: false });
  return { el: svg, update };
}
