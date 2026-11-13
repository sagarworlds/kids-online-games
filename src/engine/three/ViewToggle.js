import { el } from '../utils/dom.js';

/**
 * The button that switches a game between its 3D and 2D version.
 * It shows the view the child would switch TO, like a light switch label.
 *
 * @param {{ mode: '3d'|'2d', onChange: (next: '3d'|'2d') => void }} options
 * @returns {HTMLButtonElement}
 */
export function createViewToggle({ mode, onChange }) {
  const next = mode === '3d' ? '2d' : '3d';
  return /** @type {HTMLButtonElement} */ (el('button', {
    class: 'btn view-toggle',
    text: next === '3d' ? '🧊 3D view' : '🖼️ 2D view',
    attrs: { type: 'button', 'aria-label': `Switch to the ${next.toUpperCase()} view` },
    on: { click: () => onChange(next) },
  }));
}

/**
 * The "3D view / 2D view" block of a game's menu: the toggle, and a sentence about what the current view is like.
 *
 * @param {{
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void },
 *   notes: { '3d': string, '2d': string },
 *   onChange: () => void
 * }} options `view` is the game's view choice. `notes` says what each view looks like in this game. `onChange` redraws the menu; it is
 *   called after the child's pick is saved.
 * @returns {HTMLElement|null} Null where the device cannot do 3D, so there is nothing to switch.
 */
export function createViewSwitch({ view, notes, onChange }) {
  if (!view.supported) return null;
  return el('div', { class: 'menu__view' },
    createViewToggle({ mode: view.mode(), onChange: (next) => { view.choose(next); onChange(); } }),
    el('p', { class: 'menu__viewnote', text: notes[view.mode()] }));
}
