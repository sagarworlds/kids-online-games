import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ROLE_LABELS } from './OrganismCard.js';

/**
 * The facts about one living thing: its role, what it eats and one fun fact.
 * @param {import('../logic/organisms.js').Organism} organism
 * @param {{ onClose: () => void }} options
 * @returns {HTMLElement}
 */
export function createInfoPanel(organism, { onClose }) {
  return el('section', { class: 'info', attrs: { 'aria-label': `About the ${organism.name.toLowerCase()}` } },
    el('span', { class: 'info__icon', text: organism.icon, attrs: { 'aria-hidden': 'true' } }),
    el('div', { class: 'info__text' },
      el('h3', { class: 'info__name', text: organism.name }),
      el('p', { class: 'info__role' }, el('strong', { text: ROLE_LABELS[organism.role] }),
        organism.role === 'producer' ? ' · makes its own food from sunlight' : ''),
      organism.diet ? el('p', { class: 'info__diet', text: organism.diet }) : null,
      el('p', { class: 'info__fact', text: organism.fact })),
    createButton({ icon: '✕', ariaLabel: 'Close', variant: 'ghost', onClick: onClose }));
}
