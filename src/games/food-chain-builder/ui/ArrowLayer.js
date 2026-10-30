import { el, svgEl } from '../../../engine/utils/dom.js';
import { linkKey } from '../logic/linkChecker.js';

let layers = 0;
const GAP = 6;
const OFFSET = 7;
const STATES = ['plain', 'correct', 'wrong'];

/** Where a line from a rectangle's centre toward `toward` leaves the rectangle. */
function edgePoint(rect, toward) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const scale = Math.min(dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx), dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * The arrows, drawn as SVG on the board. An arrow leaves the food's card and ends with its head at the eater's card.
 * Each arrow is a button of its own (tap or Enter to pick it, Delete to remove it), with a ✔ or ✖ mark after a Check so
 * right and wrong are never shown by colour alone. The layer sits under the cards so a drag always starts on a card, and
 * has a second, see-through layer on top for the line that follows the finger.
 *
 * @param {{
 *   onSelect: (link: import('../logic/whatIf.js').Link) => void,
 *   onRemove: (link: import('../logic/whatIf.js').Link) => void,
 *   describe: (link: import('../logic/whatIf.js').Link, state: string) => string
 * }} options
 * @returns {{
 *   el: SVGSVGElement, liveEl: SVGSVGElement,
 *   update: (view: {
 *     links: readonly import('../logic/whatIf.js').Link[], states: ReadonlyMap<string, 'plain'|'correct'|'wrong'>,
 *     selected: string|null, rectOf: (id: string) => { x: number, y: number, w: number, h: number }|null
 *   }) => void,
 *   showLive: (from: { x: number, y: number }|null, to?: { x: number, y: number }) => void
 * }}
 */
export function createArrowLayer({ onSelect, onRemove, describe }) {
  const uid = ++layers;
  const svg = svgEl('svg', { class: 'arrows', role: 'group', 'aria-label': 'Arrows you have drawn', focusable: 'false' });
  svg.append(svgEl('defs', {}, ...STATES.map((state) => svgEl('marker', {
    id: `head-${uid}-${state}`, viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto',
  }, svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: `arrowhead arrowhead--${state}` })))));
  const group = svgEl('g');
  svg.append(group);

  const liveEl = svgEl('svg', { class: 'arrows arrows--live', 'aria-hidden': 'true', focusable: 'false' });
  const liveLine = svgEl('line', { class: 'arrow-live' });
  liveLine.setAttribute('visibility', 'hidden');
  liveEl.append(liveLine);

  function update({ links, states, selected, rectOf }) {
    const keys = new Set(links.map(linkKey));
    const nodes = [];
    for (const link of links) {
      const a = rectOf(link.from);
      const b = rectOf(link.to);
      if (!a || !b) continue;
      const centreA = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      const centreB = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const length = Math.hypot(centreB.x - centreA.x, centreB.y - centreA.y) || 1;
      const ux = (centreB.x - centreA.x) / length;
      const uy = (centreB.y - centreA.y) / length;
      // Two arrows between the same cards, one each way, are drawn side by side instead of on top of each other.
      const both = keys.has(linkKey({ from: link.to, to: link.from }));
      const side = both ? (link.from < link.to ? 1 : -1) * OFFSET : 0;
      const shift = { x: -uy * side, y: ux * side };
      const start = edgePoint(a, { x: centreB.x + shift.x, y: centreB.y + shift.y });
      const end = edgePoint(b, { x: centreA.x + shift.x, y: centreA.y + shift.y });
      const x1 = start.x + shift.x + ux * GAP;
      const y1 = start.y + shift.y + uy * GAP;
      const x2 = end.x + shift.x - ux * GAP;
      const y2 = end.y + shift.y - uy * GAP;
      const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      const state = states.get(linkKey(link)) ?? 'plain';
      const isSelected = selected === linkKey(link);

      const node = svgEl('g', {
        class: `arrow arrow--${state}${isSelected ? ' is-selected' : ''}`, tabindex: 0, role: 'button',
        'aria-label': describe(link, state), 'aria-pressed': isSelected,
      }, svgEl('path', { d, class: 'arrow__hit' }),
      svgEl('path', { d, class: 'arrow__line', 'marker-end': `url(#head-${uid}-${state})` }),
      svgEl('path', { d, class: 'arrow__flow' }));
      if (state !== 'plain') {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const mark = svgEl('text', { class: 'arrow__markmark', x: mx, y: my + 4, 'text-anchor': 'middle' });
        mark.textContent = state === 'correct' ? '✔' : '✖';
        node.append(svgEl('circle', { class: 'arrow__mark', cx: mx, cy: my, r: 9 }), mark);
      }
      node.addEventListener('click', () => onSelect(link));
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onRemove(link); }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(link); }
      });
      nodes.push(node);
    }
    // Keep the keyboard focus on the same arrow across a redraw.
    const focused = svg.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    group.replaceChildren(...nodes);
    if (focused) nodes.find((n) => n.getAttribute('aria-label') === focused)?.focus();
  }

  function showLive(from, to) {
    if (!from) { liveLine.setAttribute('visibility', 'hidden'); return; }
    liveLine.setAttribute('x1', String(from.x));
    liveLine.setAttribute('y1', String(from.y));
    liveLine.setAttribute('x2', String(to.x));
    liveLine.setAttribute('y2', String(to.y));
    liveLine.setAttribute('visibility', 'visible');
  }

  return { el: svg, liveEl, update, showLive };
}
