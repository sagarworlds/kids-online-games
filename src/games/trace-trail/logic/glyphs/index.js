import { STROKES, NUMBERS, CAPITALS, SMALLS } from './english.js';
import { SINGLE_LETTERS } from './devanagari.js';
import { ENGLISH_WORD_GLYPHS, DEVANAGARI_WORD_GLYPHS } from './words.js';

/**
 * Everything that can be traced, in sets. A set is a list of glyphs the child practises together.
 *
 * @typedef {{ id: string, label: string, icon: string, blurb: string, guide: 'four-line'|'headline', glyphs: readonly import('./define.js').Glyph[] }} GlyphSet
 */

/** @type {Readonly<Record<string, Readonly<GlyphSet>>>} */
export const SETS = Object.freeze({
  strokes: Object.freeze({ id: 'strokes', label: 'Lines and curves', icon: '〰️', blurb: 'Lines, curves and loops', guide: 'four-line', glyphs: STROKES }),
  numbers: Object.freeze({ id: 'numbers', label: 'Numbers', icon: '🔢', blurb: '0 to 9', guide: 'four-line', glyphs: NUMBERS }),
  capitals: Object.freeze({ id: 'capitals', label: 'Capital letters', icon: '🅰️', blurb: 'A to Z', guide: 'four-line', glyphs: CAPITALS }),
  small: Object.freeze({ id: 'small', label: 'Small letters', icon: '🔡', blurb: 'a to z', guide: 'four-line', glyphs: SMALLS }),
  devanagari: Object.freeze({ id: 'devanagari', label: 'देवनागरी letters', icon: 'अ', blurb: 'Hindi and Marathi letters', guide: 'headline', glyphs: SINGLE_LETTERS }),
  'words-en': Object.freeze({ id: 'words-en', label: 'English words', icon: '✏️', blurb: 'Letters joined into words', guide: 'four-line', glyphs: ENGLISH_WORD_GLYPHS }),
  'words-dev': Object.freeze({ id: 'words-dev', label: 'हिन्दी / मराठी words', icon: 'क', blurb: 'Syllables and short words', guide: 'headline', glyphs: DEVANAGARI_WORD_GLYPHS }),
});

export const SET_IDS = Object.freeze(Object.keys(SETS));
