import { GameError } from '../../../engine/utils/errors.js';

/**
 * Fitting a living thing's name into its card. The cards are a fixed size, but the names differ ("Fig tree", "Mudskipper") and so does the font
 * each device draws them in, so a name is measured in the browser and shrunk only as much as it needs. This part is the arithmetic.
 */

/** The smallest a name is shrunk to, as a share of its normal size. Below this it would be too small to read, so it is let break instead. */
export const LEAST_SCALE = 0.7;

/** The measuring and the browser's own layout can differ by a pixel or so, so a name is made a little smaller than the room it has. */
const SAFETY = 0.97;

/**
 * The parts of a name that a line can only break between: the words, and the parts of a hyphenated word ("Lion-", "tailed"). A part wider than
 * the card is what gets broken in the middle of a word.
 *
 * @param {string} name
 * @returns {string[]}
 */
export const unbreakablePieces = (name) => name.trim().split(/(?<=-)|\s+/).filter(Boolean);

/**
 * How much to shrink a name so that its widest piece fits inside the card.
 *
 * @param {number} widest Width of the widest piece at the size the name is drawn now, in pixels.
 * @param {number} room Width the card has for text, in pixels.
 * @param {number} [least] The smallest scale to give back.
 * @returns {number} 1 when it fits already, otherwise the scale that makes it fit, but not below `least`.
 * @throws {GameError} 'BAD_MEASURE' when a width is not a number, or there is no room to measure against.
 */
export function fitScale(widest, room, least = LEAST_SCALE) {
  if (!Number.isFinite(widest) || widest < 0 || !Number.isFinite(room) || room <= 0) {
    throw new GameError('BAD_MEASURE', `a ${widest}px word cannot be fitted into ${room}px`, { widest, room });
  }
  if (widest <= room) return 1;
  return Math.max(least, (room / widest) * SAFETY);
}
