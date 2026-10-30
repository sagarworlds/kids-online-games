import { el } from '../../../engine/utils/dom.js';

const BASE_PX = 24;
const MIN_PX = 18;
/** Words longer than this start to shrink so a carriage does not grow too wide. */
const FREE_LENGTH = 8;

/**
 * The font size for a word: full size for short words, a little smaller for long ones, never below 18 px (the spec's
 * minimum). Past that the carriage simply gets wider.
 * @param {string} word
 * @returns {number} Pixels.
 */
export function fontSizeFor(word) {
  return Math.max(MIN_PX, BASE_PX - Math.max(0, word.length - FREE_LENGTH));
}

/**
 * One word carriage as a button, so it can be focused and used from the keyboard as well as dragged.
 *
 * A carriage in a wrong place gets a red outline *and* a cross, and a carriage locked by a hint shows a padlock, so
 * neither is shown by colour alone.
 *
 * @param {{ id: number, word: string }} carriage
 * @param {{ locked?: boolean, wrong?: boolean, where: 'siding'|'track', position?: number }} state
 * @returns {HTMLButtonElement}
 */
export function createCarriage({ id, word }, { locked = false, wrong = false, where, position = 0 }) {
  const label = where === 'track'
    ? `${word}, in slot ${position + 1}${locked ? ', locked by a hint' : ', press Enter to send it back, arrow keys to move it'}`
    : `${word}, on the siding, press Enter to add it to the train`;
  const node = el('button', {
    class: `carriage${locked ? ' is-locked' : ''}${wrong ? ' is-wrong' : ''}`,
    attrs: { type: 'button', 'aria-label': wrong ? `${label}. This one is in the wrong place` : label, disabled: locked },
    data: { id: String(id) },
    style: { 'font-size': `${fontSizeFor(word)}px` },
  }, el('span', { class: 'carriage__word', text: word, attrs: { 'aria-hidden': 'true' } }));
  if (locked) node.append(el('span', { class: 'carriage__badge', text: '🔒', attrs: { 'aria-hidden': 'true' } }));
  return node;
}
