import { GameError } from '../../../../engine/utils/errors.js';
import { shift } from '../shapes.js';
import { defineGlyph } from './define.js';
import { SMALLS } from './english.js';
import { LETTERS, AA_SIGN } from './devanagari.js';

/** English words for the Hard level: short, lower case, using only letters with the strokes in `english.js`. */
export const ENGLISH_WORDS = Object.freeze([
  'cat', 'dog', 'sun', 'hat', 'pen', 'bus', 'map', 'box', 'fish', 'pig', 'cup', 'bed', 'red', 'run', 'van', 'top', 'sit', 'web',
]);

/**
 * Hindi and Marathi words for the Hard level: syllables and short words made of the letters that can be traced, with ा.
 * Words from a letter and ा (का, ना, माला) are the joined syllables; the others are letters side by side under one headline.
 */
export const DEVANAGARI_WORDS = Object.freeze([
  'कमल', 'घर', 'जल', 'नल', 'फल', 'बल', 'मन', 'वन', 'सब', 'हम', 'जग', 'रथ', 'तन', 'धन', 'पल', 'दल',
  'का', 'ना', 'मा', 'रा', 'काम', 'नाम', 'राम', 'माला', 'नाना', 'पापा', 'बाल', 'गाल', 'चाचा', 'दादा', 'वाला', 'सारा',
]);

const SMALL_BY_CHAR = new Map(SMALLS.map((g) => [g.char, g]));
const LETTER_BY_CHAR = new Map(LETTERS.map((l) => [l.char, l]));

/** How much boxes overlap when letters are set side by side: each box has a margin, so letters stay a little apart. */
const OVERLAP = 4;

/**
 * An English word as one glyph: its letters side by side on the four lines, each written in its own stroke order.
 * @param {string} word
 * @returns {import('./define.js').Glyph}
 * @throws {GameError} 'UNKNOWN_GLYPH' for a character that has no strokes.
 */
export function layoutEnglish(word) {
  let cursor = 0;
  const strokes = [];
  for (const char of word) {
    const glyph = SMALL_BY_CHAR.get(char);
    if (!glyph) throw new GameError('UNKNOWN_GLYPH', `There are no strokes for "${char}" in "${word}"`, { word, char });
    for (const stroke of glyph.strokes) strokes.push(shift(stroke, cursor, 0));
    cursor += glyph.w - OVERLAP;
  }
  return defineGlyph({ id: word, char: word, w: cursor + OVERLAP, guide: 'four-line', strokes });
}

/**
 * A Devanagari word as one glyph. The letters are written left to right (each with its own strokes, and a ा after its letter
 * where the word has one), then one headline is drawn across the whole word, last, as a hand does it.
 *
 * @param {string} word Letters from `devanagari.js`, each possibly followed by ा.
 * @returns {import('./define.js').Glyph}
 * @throws {GameError} 'UNKNOWN_GLYPH' for a character that cannot be written, or a ा with no letter before it.
 */
export function layoutDevanagari(word) {
  let cursor = 0;
  const strokes = [];
  let headStart = null;
  let headEnd = 0;
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const letter = LETTER_BY_CHAR.get(chars[i]);
    if (!letter) throw new GameError('UNKNOWN_GLYPH', `There are no strokes for "${chars[i]}" in "${word}"`, { word, char: chars[i] });
    for (const stroke of letter.body) strokes.push(shift(stroke, cursor, 0));
    if (letter.headline) {
      headStart ??= cursor + letter.headline[0];
      headEnd = Math.max(headEnd, cursor + letter.headline[1]);
    }
    if (chars[i + 1] === AA_SIGN.char) {
      const stemX = cursor + letter.w + 4;
      strokes.push(shift(AA_SIGN.stroke, stemX - AA_SIGN.stroke[0][0], 0));
      headEnd = Math.max(headEnd, stemX);
      cursor = stemX - 2;
      i += 1;
    } else {
      cursor += letter.w - OVERLAP;
    }
  }
  if (strokes.length === 0 || headStart === null) throw new GameError('UNKNOWN_GLYPH', `"${word}" has nothing to write`, { word });
  strokes.push([[headStart, 40], [headEnd, 40]]);
  return defineGlyph({ id: word, char: word, w: Math.ceil(cursor + OVERLAP + 4), guide: 'headline', strokes });
}

/** @type {readonly import('./define.js').Glyph[]} */
export const ENGLISH_WORD_GLYPHS = Object.freeze(ENGLISH_WORDS.map(layoutEnglish));
/** @type {readonly import('./define.js').Glyph[]} */
export const DEVANAGARI_WORD_GLYPHS = Object.freeze(DEVANAGARI_WORDS.map(layoutDevanagari));
