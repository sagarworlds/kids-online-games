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
