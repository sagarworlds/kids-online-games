import { el } from '../../../engine/utils/dom.js';
import { describeToken } from '../logic/generators/helpers.js';
import { createTokenSvg } from './TokenView.js';

/** @param {import('../logic/equality.js').Item} item @returns {string} For screen readers. */
export const describeItem = (item) => (typeof item === 'number' ? String(item) : describeToken(item));

/**
 * The picture of one item: a big number, or a shape. Decorative inside a labelled parent.
 * @param {import('../logic/equality.js').Item} item
 * @returns {HTMLElement}
 */
export function createItemView(item) {
  return typeof item === 'number'
    ? el('span', { class: 'item item--number', text: String(item), attrs: { 'aria-hidden': 'true' } })
    : el('span', { class: 'item item--token', attrs: { 'aria-hidden': 'true' } }, createTokenSvg(item));
}
