import { el } from '../../../engine/utils/dom.js';
import { signOnItsOwn } from '../logic/devanagari.js';

/**
 * The बाराखडी chart: the consonants down the side and the vowel signs across the top. Tapping a cell picks that syllable.
 *
 * @param {{
 *   content: import('../logic/levels.js').Content, lang: import('../logic/devanagari.js').Lang,
 *   onPick: (syllable: import('../logic/levels.js').Syllable) => void
 * }} options `lang` is the language of the letters, which the table declares once (a screen reader reads Devanagari with its English voice
 *   unless it is told), apart from the one English word in it.
 * @returns {{ el: HTMLElement, select: (syllable: import('../logic/levels.js').Syllable|null) => void }}
 */
export function createLearnGrid({ content, lang, onPick }) {
  const cells = new Map();
  const head = el('tr', {}, el('th', { class: 'grid__corner', attrs: { scope: 'col' } }, el('span', { class: 'sr-only', text: 'Letter', attrs: { lang: 'en' } })),
    ...content.signs.map((sign) => el('th', { class: 'grid__sign', attrs: { scope: 'col' } },
      el('span', { class: 'grid__sign-mark', text: signOnItsOwn(sign) }), el('span', { class: 'grid__sign-vowel', text: sign.vowel }))));
  const rows = content.consonants.map((consonant) => el('tr', {},
    el('th', { class: 'grid__letter', text: consonant.char, attrs: { scope: 'row' } }),
    ...content.signs.map((sign) => {
      const syllable = content.syllables.find((s) => s.consonant === consonant && s.sign === sign);
      const cell = el('button', { class: 'grid__cell', text: syllable.text, attrs: { type: 'button', 'aria-label': `${consonant.char} with ${signOnItsOwn(sign)}: ${syllable.text}` }, on: { click: () => onPick(syllable) } });
      cells.set(syllable, cell);
      return el('td', {}, cell);
    })));
  const table = el('table', { class: 'grid', attrs: { lang } }, el('thead', {}, head), el('tbody', {}, ...rows));
  return {
    el: el('div', { class: 'grid__scroller', attrs: { role: 'region', 'aria-label': 'Letters down the side, vowel signs across the top', tabindex: 0 } }, table),
    select(syllable) {
      for (const [s, cell] of cells) cell.classList.toggle('is-picked', s === syllable);
    },
  };
}
