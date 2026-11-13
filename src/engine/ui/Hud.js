import { el } from '../utils/dom.js';
import { createButton } from './Button.js';

/**
 * Top bar shared by every game: Home button, title, live stats and the
 * parent-settings gear.
 *
 * On a phone the bar stays on one row (see `ui.css`): the stats share the space between the two buttons and the title, which no longer
 * fits beside them, is kept for screen readers only. The stats sit in one group for that reason.
 *
 * @param {{
 *   homeHref: string, title: string,
 *   stats?: { id: string, label: string }[],
 *   onSettings?: () => void
 * }} options
 * @returns {{
 *   el: HTMLElement,
 *   setStat: (id: string, value: string|number|Node) => void
 * }}
 */
export function createHud({ homeHref, title, stats = [], onSettings }) {
  const values = new Map();
  const statNodes = stats.map(({ id, label }) => {
    const value = el('span', { class: 'hud__value', text: '0' });
    values.set(id, value);
    return el('div', { class: 'hud__stat' }, el('span', { class: 'hud__label', text: label }), value);
  });

  const root = el(
    'header',
    { class: statNodes.length > 0 ? 'hud hud--stats' : 'hud' },
    createButton({ icon: '🏠', ariaLabel: 'Home', href: homeHref, variant: 'ghost' }),
    el('span', { class: 'hud__title', text: title }),
    statNodes.length > 0 ? el('div', { class: 'hud__stats' }, ...statNodes) : null,
    onSettings ? createButton({ icon: '⚙️', ariaLabel: 'Grown-ups settings', variant: 'ghost', onClick: onSettings }) : null,
  );

  return {
    el: root,
    setStat(id, value) {
      const node = values.get(id);
      if (!node) return;
      if (value instanceof Node) node.replaceChildren(value);
      else node.textContent = String(value);
    },
  };
}
