import { fitTexts } from '../../../engine/ui/fitText.js';

/**
 * Shrinks any card name whose longest word is wider than its card, so that no word is broken in the middle ("Mudskippe" and "r"). The card's
 * size and font come from the stylesheet, which changes with the board's shape, so this is run again each time the board is laid out. A name
 * that fits is left at the size the stylesheet gives it. The measuring is the engine's (`engine/ui/fitText.js`); this says which parts of the
 * board are the names and the cards.
 *
 * @param {HTMLElement} board The element holding the cards.
 * @returns {void}
 */
export function fitCardNames(board) {
  fitTexts(board, { text: '.card__name', box: '.card', source: 'food-chain-builder:fit-names' });
}
