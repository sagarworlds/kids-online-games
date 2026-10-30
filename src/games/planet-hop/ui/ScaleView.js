import { el, svgEl } from '../../../engine/utils/dom.js';
import { needleAngle } from '../logic/scale.js';
import { formatKg } from '../logic/weight.js';

const RADIUS = 90;

/**
 * The cartoon bathroom scale: a half-circle dial with a needle that springs to the new weight, and the same number
 * written underneath (the needle is for looking at, the number is what a screen reader reads).
 *
 * @param {{ max: number }} options The weight at the right-hand end of the dial.
 * @returns {{ el: HTMLElement, set: (kg: number) => void }}
 */
export function createScaleView({ max }) {
  const svg = svgEl('svg', { class: 'scale__dial', viewBox: '-110 -108 220 128', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('path', { d: `M ${-RADIUS} 0 A ${RADIUS} ${RADIUS} 0 0 1 ${RADIUS} 0 Z`, class: 'scale__face' }));
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const angle = -90 + (180 * i) / ticks;
    const rad = (angle * Math.PI) / 180;
    const atEnd = i === 0 || i === ticks;
    svg.append(
      svgEl('line', { class: 'scale__tick', x1: Math.sin(rad) * (RADIUS - 10), y1: -Math.cos(rad) * (RADIUS - 10), x2: Math.sin(rad) * RADIUS, y2: -Math.cos(rad) * RADIUS }),
      // The two end numbers would sit on the dial's flat edge, so they are lifted and moved in a little.
      svgEl('text', { class: 'scale__number', x: Math.sin(rad) * (RADIUS - (atEnd ? 30 : 24)), y: -Math.cos(rad) * (RADIUS - 24) + (atEnd ? -6 : 4), 'text-anchor': 'middle' }, `${Math.round((max * i) / ticks)}`),
    );
  }
  const needle = svgEl('g', { class: 'scale__needle' }, svgEl('line', { x1: 0, y1: 4, x2: 0, y2: -(RADIUS - 14) }));
  svg.append(needle, svgEl('circle', { class: 'scale__hub', r: 7 }));

  const readout = el('p', { class: 'scale__readout', attrs: { role: 'status' } });
  const set = (kg) => {
    needle.style.transform = `rotate(${needleAngle(kg, max)}deg)`;
    readout.textContent = formatKg(kg);
  };
  set(0);
  return { el: el('div', { class: 'scale' }, svg, readout), set };
}
