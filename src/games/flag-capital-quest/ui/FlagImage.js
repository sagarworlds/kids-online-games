import { el } from '../../../engine/utils/dom.js';
import { logError, GameError } from '../../../engine/utils/errors.js';

/**
 * A country's flag, from the local SVG file (flag emoji are not used: Windows does not draw them). If a flag file fails
 * to load, the failure is logged once for that country, the picture is replaced by a plain box so the screen still
 * works, and the country goes in `broken` so later trips skip it.
 *
 * @param {import('../logic/countries.js').Country} country
 * @param {{ alt?: string, broken?: Set<string>, className?: string }} [options]
 * @returns {HTMLElement}
 */
export function createFlag(country, { alt = '', broken, className = 'flag' } = {}) {
  const image = el('img', { class: className, attrs: { src: new URL(`../${country.flag}`, import.meta.url).href, alt, decoding: 'async', draggable: 'false' } });
  image.addEventListener('error', () => {
    if (broken && !broken.has(country.code)) {
      broken.add(country.code);
      logError(new GameError('FLAG_MISSING', `The flag file for ${country.code} (${country.name}) could not be loaded`, { code: country.code, flag: country.flag }), 'flag-capital-quest');
    }
    image.replaceWith(el('span', { class: `${className} flag--missing`, text: '🏳️', attrs: { role: 'img', 'aria-label': 'Flag not available' } }));
  }, { once: true });
  return image;
}
