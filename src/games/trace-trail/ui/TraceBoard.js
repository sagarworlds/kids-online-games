import { svgEl } from '../../../engine/utils/dom.js';
import { toSvgPath, pointAlong } from '../logic/shapes.js';
import { RULES, GLYPH_HEIGHT } from '../logic/glyphs/define.js';

/** Room on each side of the writing, in drawing units. */
export const PAD = 24;

/**
 * Draws the ruled lines a glyph is written on.
 * @param {'four-line'|'headline'} guide
 * @param {number} width
 * @returns {SVGElement}
 */
export function drawRules(guide, width) {
  const line = (y, cls) => svgEl('line', { class: `rule ${cls}`, x1: 0, x2: width, y1: y, y2: y });
  return guide === 'headline'
    ? svgEl('g', { class: 'rules rules--headline' }, line(RULES.headline, 'rule--head'), line(RULES.baseline, 'rule--base'))
    : svgEl('g', { class: 'rules rules--four' }, line(RULES.cap, 'rule--solid'), line(RULES.xHeight, 'rule--dash'), line(RULES.baseline, 'rule--base'), line(RULES.descender, 'rule--dash'));
}

/**
 * The page a letter is written on. It only draws; the scene feeds it what the tracing rules say.
 *
 * - The strokes are drawn as a faint dotted path to follow, with a numbered dot where each starts. The stroke to write now is
 *   highlighted, finished strokes turn green, and the part of the stroke already traced is painted over it.
 * - The pencil's ink is drawn as it moves. A snail sits at the end of the traced part and moves only while the pencil is on the path.
 * - A demonstration pencil can write the strokes in order.
 *
 * @param {{
 *   glyph: import('../logic/glyphs/define.js').Glyph,
 *   onDown: (point: [number, number]) => void, onMove: (point: [number, number]) => void, onUp: () => void
 * }} options Points are in the glyph's own drawing units.
 * @returns {{
 *   el: SVGSVGElement, scale: () => number, setCurrent: (index: number) => void, markDone: (index: number) => void,
 *   setProgress: (index: number, upTo: number) => void, setSnail: (point: [number, number]|null) => void,
 *   setInk: (points: [number, number][], off: boolean) => void, setDemo: (state: { stroke: number, distance: number, pen: boolean }|null) => void,
 *   lock: (locked: boolean) => void
 * }}
 */
export function createTraceBoard({ glyph, onDown, onMove, onUp }) {
  const width = glyph.w + PAD * 2;
  const svg = svgEl('svg', { class: 'board', viewBox: `0 0 ${width} ${GLYPH_HEIGHT}`, role: 'img', 'aria-label': `Writing page for ${glyph.char}`, focusable: 'false' });
  const page = svgEl('g', { transform: `translate(${PAD} 0)` });
  const bands = glyph.strokes.map((stroke) => svgEl('path', { class: 'stroke__band', d: toSvgPath(stroke) }));
  const dots = glyph.strokes.map((stroke) => svgEl('path', { class: 'stroke__dots', d: toSvgPath(stroke) }));
  const traced = glyph.strokes.map(() => svgEl('path', { class: 'stroke__traced', d: '' }));
  const starts = glyph.strokes.map((stroke, i) => {
    const [x, y] = stroke[0];
    const text = svgEl('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    text.textContent = String(i + 1);
    return svgEl('g', { class: 'stroke__start' }, svgEl('circle', { cx: x, cy: y, r: 9 }), text);
  });
  const ink = svgEl('path', { class: 'ink', d: '' });
  const snail = svgEl('text', { class: 'snail', 'text-anchor': 'middle', visibility: 'hidden', 'aria-hidden': 'true' });
  snail.textContent = '🐌';
  const demoLine = svgEl('path', { class: 'demo__line', d: '' });
  const pencil = svgEl('text', { class: 'demo__pencil', 'text-anchor': 'middle', visibility: 'hidden', 'aria-hidden': 'true' });
  pencil.textContent = '✏️';
  page.append(drawRules(glyph.guide, glyph.w), ...bands, ...dots, ...traced, ink, ...starts, demoLine, snail, pencil);
  svg.append(page);

  // ---- the pencil: one pointer at a time (a resting palm or a second finger is ignored)
  let activeId = null;
  let locked = false;
  const toPoint = (event) => {
    const r = svg.getBoundingClientRect();
    return [((event.clientX - r.left) / r.width) * width - PAD, ((event.clientY - r.top) / r.height) * GLYPH_HEIGHT];
  };
  svg.addEventListener('pointerdown', (event) => {
    if (locked || activeId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    activeId = event.pointerId;
    svg.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    onDown(toPoint(event));
  });
  svg.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activeId) return;
    // Browsers batch fast moves; the pieces in between are used too, so a quick stroke is followed all the way.
    const batch = event.getCoalescedEvents?.() ?? [];
    for (const e of batch.length > 0 ? batch : [event]) onMove(toPoint(e));
  });
  const end = (event) => {
    if (event.pointerId !== activeId) return;
    activeId = null;
    onUp();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  return {
    el: svg,
    /** Screen pixels for each drawing unit. */
    scale: () => (svg.getBoundingClientRect().width || width) / width,
    setCurrent(index) {
      bands.forEach((band, i) => band.classList.toggle('is-current', i === index));
      starts.forEach((start, i) => start.classList.toggle('is-current', i === index));
    },
    markDone(index) {
      bands[index].classList.remove('is-current');
      bands[index].classList.add('is-done');
      dots[index].classList.add('is-done');
      starts[index].classList.add('is-done');
      traced[index].setAttribute('d', toSvgPath(glyph.strokes[index]));
      traced[index].classList.add('is-done');
    },
    setProgress(index, upTo) {
      traced[index].setAttribute('d', upTo < 1 ? '' : toSvgPath(glyph.strokes[index].slice(0, upTo + 1)));
    },
    setSnail(point) {
      if (!point) {
        snail.setAttribute('visibility', 'hidden');
        return;
      }
      snail.setAttribute('visibility', 'visible');
      // A little above and to the right of the path, so it never hides the dot or the line being followed.
      snail.setAttribute('x', String(point[0] + 6));
      snail.setAttribute('y', String(point[1] - 14));
    },
    setInk(points, off) {
      ink.setAttribute('d', points.length < 2 ? '' : toSvgPath(points));
      ink.classList.toggle('is-off', off);
    },
    setDemo(state) {
      if (!state) {
        demoLine.setAttribute('d', '');
        pencil.setAttribute('visibility', 'hidden');
        return;
      }
      const stroke = glyph.strokes[state.stroke];
      // The strokes already written stay drawn, then the current stroke up to the pencil.
      const upTo = Math.max(1, Math.round(state.distance / 3));
      const before = glyph.strokes.slice(0, state.stroke).map((s) => toSvgPath(s));
      demoLine.setAttribute('d', [...before, toSvgPath(stroke.slice(0, upTo + 1))].join(' '));
      const tip = pointAlong(stroke, state.distance);
      pencil.setAttribute('visibility', state.pen ? 'visible' : 'hidden');
      pencil.setAttribute('x', String(tip[0] + 8));
      pencil.setAttribute('y', String(tip[1] - 4));
    },
    lock(value) {
      locked = value;
      svg.classList.toggle('is-locked', value);
    },
  };
}
