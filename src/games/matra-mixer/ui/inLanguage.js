import { el } from '../../../engine/utils/dom.js';
import { splitScript } from '../logic/devanagari.js';

/**
 * The pieces of a sentence as DOM nodes, with each run of Devanagari in a `<span lang>` that names its language. Without it a screen
 * reader reads Hindi or Marathi with its English voice (WCAG 3.1.2, language of parts). Spread the result into the children of an
 * element: `el('p', {}, ...inLanguage('Pop! क + अ = क', 'hi'))`.
 *
 * An element that is all Devanagari needs no spans: give it `lang` directly.
 *
 * @param {string} text
 * @param {import('../logic/devanagari.js').Lang} lang The language of the Devanagari in the text.
 * @returns {(Node|string)[]}
 */
export function inLanguage(text, lang) {
  return splitScript(text).map((part) => (part.devanagari ? el('span', { attrs: { lang } }, part.text) : part.text));
}
