import { el, svgEl } from '../../../engine/utils/dom.js';
import { toSvgPath } from '../logic/shapes.js';
import { GLYPH_HEIGHT } from '../logic/glyphs/define.js';
import { paginate, rowLayout, ROWS_PER_PAGE } from '../logic/worksheet.js';
import { drawRules, PAD } from './TraceBoard.js';

/**
 * One box of a worksheet: the ruled lines, and the glyph as a model to copy ("model": solid, with the numbered start dots), as dots
 * to trace ("dotted"), or nothing ("empty") to write it alone.
 *
 * @param {import('../logic/glyphs/define.js').Glyph} glyph
 * @param {'model'|'dotted'|'empty'} kind
 * @returns {SVGSVGElement}
 */
export function drawCell(glyph, kind) {
  const width = glyph.w + PAD * 2;
  const page = svgEl('g', { transform: `translate(${PAD} 0)` }, drawRules(glyph.guide, glyph.w));
  if (kind !== 'empty') {
    glyph.strokes.forEach((stroke, i) => {
      page.append(svgEl('path', { class: kind === 'model' ? 'cell__model' : 'cell__dots', d: toSvgPath(stroke) }));
      if (kind === 'model' || i === 0) {
        const [x, y] = stroke[0];
        const text = svgEl('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
        text.textContent = String(i + 1);
        page.append(svgEl('g', { class: 'cell__start' }, svgEl('circle', { cx: x, cy: y, r: 8 }), text));
      }
    });
  }
  return svgEl('svg', { class: `cell cell--${kind}`, viewBox: `0 0 ${width} ${GLYPH_HEIGHT}`, 'aria-hidden': 'true', focusable: 'false' }, page);
}

/**
 * A printable tracing sheet for a set: pages of rows, each row a model, dotted copies and empty boxes.
 *
 * @param {{ title: string, glyphs: readonly import('../logic/glyphs/define.js').Glyph[], guide: 'four-line'|'headline' }} options
 * @returns {HTMLElement}
 */
export function createWorksheet({ title, glyphs, guide }) {
  const pages = paginate(glyphs, ROWS_PER_PAGE[guide]);
  return el('div', { class: 'sheet' }, ...pages.map((rows, pageIndex) => el('section', { class: 'sheet__page', attrs: { 'aria-label': `Worksheet page ${pageIndex + 1} of ${pages.length}` } },
    el('header', { class: 'sheet__head' },
      el('h2', { class: 'sheet__title', text: `${title}: trace and write` }),
      el('p', { class: 'sheet__name', text: 'Name: ______________________   Date: ____________' })),
    ...rows.map((glyph) => {
      const { dotted, empty } = rowLayout(glyph);
      return el('div', { class: 'sheet__row' },
        drawCell(glyph, 'model'),
        ...Array.from({ length: dotted }, () => drawCell(glyph, 'dotted')),
        ...Array.from({ length: empty }, () => drawCell(glyph, 'empty')));
    }),
    el('p', { class: 'sheet__foot', text: `Page ${pageIndex + 1} of ${pages.length}. Start at dot 1 and follow the numbers.` }))));
}
