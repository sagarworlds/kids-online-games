import { el } from '../../../engine/utils/dom.js';
import { createFlag } from './FlagImage.js';

/**
 * A passport stamp for an explored country: its flag, name, capital and the one-sentence fun fact.
 * @param {import('../logic/countries.js').Country} country
 * @param {{ broken?: Set<string>, showFact?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function createStampCard(country, { broken, showFact = true } = {}) {
  return el('article', { class: 'stamp-card', attrs: { 'aria-label': `${country.name} stamp` } },
    createFlag(country, { broken, className: 'stamp-card__flag' }),
    el('div', { class: 'stamp-card__text' },
      el('h3', { class: 'stamp-card__name', text: country.name }),
      country.capital.length ? el('p', { class: 'stamp-card__capital', text: `Capital: ${country.capital[0]}` }) : null,
      showFact ? el('p', { class: 'stamp-card__fact', text: country.fact }) : null));
}
