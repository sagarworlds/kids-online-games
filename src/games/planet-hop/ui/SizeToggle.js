import { el } from '../../../engine/utils/dom.js';

/**
 * The "Show real size" switch. Normal pictures are drawn on a compressed scale so Mercury stays big enough to see and
 * tap; switching this on draws the true proportions, to show how much bigger Jupiter really is.
 * A native checkbox, so keyboard and screen readers work without extra code.
 *
 * @param {{ onChange: (real: boolean) => void }} options
 * @returns {HTMLElement}
 */
export function createSizeToggle({ onChange }) {
  const input = el('input', { attrs: { type: 'checkbox' }, on: { change: () => onChange(input.checked) } });
  return el('label', { class: 'toggle' }, input, el('span', { text: 'Show real size' }));
}
