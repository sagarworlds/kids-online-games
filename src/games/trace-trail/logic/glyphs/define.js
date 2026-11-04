import { GameError } from '../../../../engine/utils/errors.js';
import { resample, bounds } from '../shapes.js';

/**
 * The ruled lines every letter is written on, in drawing units (y grows downwards). Capital letters and tall small letters
 * reach the CAP line, small letters start at the X-HEIGHT line, everything sits on the BASELINE, and letters like g and y
 * hang to the DESCENDER line. Devanagari letters hang from a headline (the शिरोरेखा) at HEADLINE.
 */
export const RULES = Object.freeze({ cap: 20, xHeight: 60, baseline: 110, descender: 150, headline: 40 });

/** Every glyph is drawn inside this height (a little room above and below the ruled lines). */
export const GLYPH_HEIGHT = 170;

/**
 * @typedef {{
 *   id: string, char: string, w: number, guide: 'four-line'|'headline'|'free',
 *   strokes: import('../shapes.js').Point[][]
 * }} Glyph
 * `strokes` are in the order they are written, each an evened-out path; `w` is how wide the glyph's box is (and how far the
 * next letter of a word moves along).
 */

/**
 * Makes a glyph from rough paths: evens each stroke out and checks that it fits its box, so a slip in the data (a stroke far
 * outside the letter, or one that cannot be traced) is found when the game loads and not by a child.
 *
 * @param {{ id: string, char: string, w: number, guide?: Glyph['guide'], strokes: import('../shapes.js').Point[][] }} spec
 * @returns {Glyph}
 * @throws {GameError} 'BAD_GLYPH'
 */
export function defineGlyph({ id, char, w, guide = 'four-line', strokes }) {
  if (strokes.length === 0) throw new GameError('BAD_GLYPH', `Glyph "${id}" has no strokes`, { id });
  const paths = strokes.map((rough, i) => {
    try {
      return resample(rough);
    } catch (error) {
      if (!(error instanceof GameError) || error.code !== 'BAD_PATH') throw error;
      throw new GameError('BAD_GLYPH', `Glyph "${id}" stroke ${i + 1} cannot be traced: ${error.message}`, { id, stroke: i });
    }
  });
  const box = bounds(paths);
  const margin = 6;
  if (box.x0 < -margin || box.x1 > w + margin || box.y0 < -margin || box.y1 > GLYPH_HEIGHT) {
    throw new GameError('BAD_GLYPH', `Glyph "${id}" does not fit its ${w} x ${GLYPH_HEIGHT} box (it spans ${Math.round(box.x0)}..${Math.round(box.x1)}, ${Math.round(box.y0)}..${Math.round(box.y1)})`, { id, box, w });
  }
  return Object.freeze({ id, char, w, guide, strokes: Object.freeze(paths) });
}
