import { el } from '../../../engine/utils/dom.js';

/** The words shown for each role. */
export const ROLE_LABELS = Object.freeze({
  producer: 'Producer', herbivore: 'Herbivore', carnivore: 'Carnivore', omnivore: 'Omnivore', decomposer: 'Decomposer',
});

/**
 * A card for one living thing: its picture, its name and, on Easy, what it is. The card is a button (so keyboard and
 * screen readers can use it); the little ⓘ button beside it opens the facts. They are two separate buttons because a
 * button cannot hold another button.
 *
 * @param {import('../logic/organisms.js').Organism} organism
 * @param {{ showRole: boolean, onInfo: (organism: import('../logic/organisms.js').Organism) => void }} options
 * @returns {{ el: HTMLElement, card: HTMLButtonElement }} `el` is what gets placed on the board.
 */
export function createOrganismCard(organism, { showRole, onInfo }) {
  const card = el('button', {
    class: 'card', attrs: { type: 'button', 'aria-label': organism.name }, data: { id: organism.id },
  },
  el('span', { class: 'card__icon', text: organism.icon, attrs: { 'aria-hidden': 'true' } }),
  el('span', { class: 'card__name', text: organism.name }),
  showRole ? el('span', { class: `card__role card__role--${organism.role}`, text: ROLE_LABELS[organism.role] }) : null);
  const info = el('button', {
    class: 'card__info', attrs: { type: 'button', 'aria-label': `About the ${organism.name.toLowerCase()}` },
    on: { click: () => onInfo(organism) },
  }, el('span', { text: 'i', attrs: { 'aria-hidden': 'true' } }));
  return { el: el('div', { class: 'cardwrap', data: { id: organism.id } }, card, info), card };
}
