import { GameError, logError } from '../utils/errors.js';
import { LEAST_SCALE, fitScale, unbreakablePieces } from '../utils/fitText.js';

/** How much a text is made smaller each time it is still too tall for its card (see `fitTexts`). */
const HEIGHT_STEP = 0.92;

/**
 * How wide each piece of a text is when it is drawn the way `label` is drawn: its font, its size from the stylesheet, and its language (the
 * same Devanagari word is wider in Marathi than in Hindi, which a canvas does not know). Each piece is put on one line in a hidden copy of the
 * label and measured where it is, so the answer is what the browser will lay out.
 *
 * @param {HTMLElement} label
 * @param {readonly string[]} pieces
 * @returns {number[]} Pixels, one for each piece.
 */
function widthsOf(label, pieces) {
  const parent = label.parentElement;
  if (!parent) throw new GameError('NO_PLACE', 'a text that is not in the page cannot be measured', { text: label.textContent });
  const probes = pieces.map((piece) => {
    const probe = /** @type {HTMLElement} */ (label.cloneNode(false));
    // `cssText` replaces the size an earlier fit left on the label, so a piece is measured at the stylesheet's size.
    probe.style.cssText = 'position: absolute; visibility: hidden; white-space: nowrap; width: auto; height: auto; inset: 0 auto auto 0;';
    probe.removeAttribute('id');
    probe.textContent = piece;
    return probe;
  });
  parent.append(...probes);
  // The used width in layout pixels, which a 3D turn of the card (half way through a flip it is edge-on) does not change.
  const widths = probes.map((probe) => parseFloat(getComputedStyle(probe).width));
  for (const probe of probes) probe.remove();
  return widths;
}

/**
 * Shrinks every text whose widest word is wider than the card it sits in, so that no word is broken in the middle ("Mudskippe" and "r"). The
 * card's size and the text's font come from the stylesheet, which changes with the screen, so each text is measured as the stylesheet draws it
 * now and this is run again whenever the cards are laid out or a font arrives. A text that fits is left at the size the stylesheet gives it.
 *
 * Only the look of the texts depends on this, so if measuring is not possible the problem is logged and the texts stay as the stylesheet draws
 * them; the game goes on.
 *
 * @param {ParentNode} root The element holding the cards.
 * @param {{ text: string, box: string, source: string, least?: number, height?: boolean }} options `text` and `box` are selectors: each text
 *   found in `root` is fitted into its closest `box` (less the box's padding). `source` names the caller in the log. `least` is the smallest
 *   scale a text may be given (see `fitScale`); a text that would need less is let break instead. With `height`, a text that is narrow enough
 *   but makes its box taller than the box is (two lines of a long phrase beside a picture) is shrunk further, by steps, until it fits or is as
 *   small as `least` allows.
 * @returns {void}
 */
export function fitTexts(root, { text, box, source, least = LEAST_SCALE, height = false }) {
  try {
    for (const node of root.querySelectorAll(text)) {
      const label = /** @type {HTMLElement} */ (node);
      // Measure from the stylesheet's size, not from the size an earlier fit left behind.
      label.style.fontSize = '';
      const card = /** @type {HTMLElement|null} */ (label.closest(box));
      const pieces = unbreakablePieces(label.textContent ?? '');
      if (!card || pieces.length === 0) continue;
      const cardStyle = getComputedStyle(card);
      const room = card.clientWidth - parseFloat(cardStyle.paddingLeft) - parseFloat(cardStyle.paddingRight);
      // A board that is not on screen has no sizes to fit against; it is fitted when it is next laid out.
      if (!(room > 0)) continue;

      const natural = parseFloat(getComputedStyle(label).fontSize);
      let scale = fitScale(Math.max(...widthsOf(label, pieces)), room, least);
      const apply = () => { label.style.fontSize = `${natural * scale}px`; };
      if (scale < 1) apply();
      while (height && scale > least && card.scrollHeight > card.clientHeight + 1) {
        scale = Math.max(least, scale * HEIGHT_STEP);
        apply();
      }
    }
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
    logError(error, source);
  }
}
