import { GameError } from '../../../../engine/utils/errors.js';
import { line, resample } from '../shapes.js';
import { defineGlyph, RULES } from './define.js';
import { DEVANAGARI_DATA } from './devanagari-data.js';

const HL = RULES.headline;
const BL = RULES.baseline;

/**
 * Devanagari letters. Each is written left to right, top to bottom, and the headline (the शिरोरेखा) comes last. A letter's
 * `body` is its strokes without the headline; `headline` is how far the line reaches (`[from, to]` across the letter's box), or
 * null for a letter that has none. In a word the headline is drawn once, across all the letters, after the last one.
 *
 * The shapes are in `devanagari-data.js` (generated, see the README).
 *
 * @typedef {import('./define.js').Glyph & { headline: [number, number]|null, body: import('../shapes.js').Point[][] }} Letter
 */

/** @returns {Letter} */
function letter({ id, char, w, headline, strokes }) {
  const base = defineGlyph({ id, char, w, guide: 'headline', strokes });
  return Object.freeze({ ...base, headline, body: base.strokes });
}

/** The strokes for writing a letter on its own: its body, then the headline. @param {Letter} l @returns {import('../shapes.js').Point[][]} */
export function writeStrokes(l) {
  if (!l.headline) return [...l.body];
  const [x0, x1] = l.headline;
  return [...l.body, resample(line(x0, HL, x1, HL))];
}

/** The vowels and consonants that can be traced. @type {readonly Letter[]} */
export const LETTERS = Object.freeze(DEVANAGARI_DATA.map((d) => letter(d)));

/** @param {string} id @returns {Letter} @throws {GameError} 'UNKNOWN_GLYPH' */
export function letterById(id) {
  const found = LETTERS.find((l) => l.id === id);
  if (!found) throw new GameError('UNKNOWN_GLYPH', `There is no Devanagari letter "${id}"`, { id });
  return found;
}

/** The letters as glyphs ready to write one at a time (the headline added last). @type {readonly import('./define.js').Glyph[]} */
export const SINGLE_LETTERS = Object.freeze(LETTERS.map((l) => Object.freeze({ id: l.id, char: l.char, w: l.w, guide: l.guide, strokes: Object.freeze(writeStrokes(l)) })));

/**
 * The vowel sign ा (the "aa" matra) written after a consonant: a stem down from the headline. It is 22 units wide.
 */
export const AA_SIGN = Object.freeze({ id: 'aa', char: 'ा', w: 22, stroke: line(11, HL, 11, BL) });

/** For the contact sheet while drawing the letters. */
export const SHEETS = { devanagari: SINGLE_LETTERS };
