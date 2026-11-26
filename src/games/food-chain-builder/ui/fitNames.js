import { GameError, logError } from '../../../engine/utils/errors.js';
import { fitScale, unbreakablePieces } from '../logic/fit.js';

/** @type {CanvasRenderingContext2D|null} */
let pen = null;

/**
 * How wide some text is in a given font. A canvas measures it with the font the page uses, without putting anything on the page.
 * @param {string} text
 * @param {string} font A CSS font value, such as "800 19px sans-serif".
 * @returns {number} Pixels.
 * @throws {GameError} 'NO_CANVAS' when the browser gives no way to measure text.
 */
function widthOf(text, font) {
  pen ??= document.createElement('canvas').getContext('2d');
  if (!pen) throw new GameError('NO_CANVAS', 'the browser gave no way to measure text', { text });
  pen.font = font;
  return pen.measureText(text).width;
}

/**
 * Shrinks any card name whose longest word is wider than its card, so that no word is broken in the middle ("Mudskippe" and "r"). The card's
 * size and font come from the stylesheet, which changes with the board's shape, so each name is measured as the stylesheet draws it now and
 * this is run again whenever the board is laid out. A name that fits is left at the size the stylesheet gives it.
 *
 * Only the look of the names depends on this, so if measuring is not possible the problem is logged and the names stay as the stylesheet
 * draws them; the game goes on.
 *
 * @param {HTMLElement} board The element holding the cards.
 * @returns {void}
 */
export function fitCardNames(board) {
  try {
    for (const name of board.querySelectorAll('.card__name')) {
      const label = /** @type {HTMLElement} */ (name);
      // Measure from the stylesheet's size, not from the size an earlier fit left behind.
      label.style.fontSize = '';
      const card = label.closest('.card');
      const pieces = unbreakablePieces(label.textContent ?? '');
      if (!card || pieces.length === 0) continue;
      const cardStyle = getComputedStyle(card);
      const room = card.clientWidth - parseFloat(cardStyle.paddingLeft) - parseFloat(cardStyle.paddingRight);
      // A board that is not on screen has no sizes to fit against; it is fitted when it is next laid out.
      if (!(room > 0)) continue;

      const style = getComputedStyle(label);
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const scale = fitScale(Math.max(...pieces.map((piece) => widthOf(piece, font))), room);
      if (scale < 1) label.style.fontSize = `${parseFloat(style.fontSize) * scale}px`;
    }
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    logError(error, 'food-chain-builder:fit-names');
  }
}
