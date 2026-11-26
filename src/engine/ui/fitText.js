import { GameError, logError } from '../utils/errors.js';
import { LEAST_SCALE, fitScale, unbreakablePieces } from '../utils/fitText.js';

/** How much a text is made smaller each time it is still too tall for its card (see `fitTexts`). */
const HEIGHT_STEP = 0.92;

/**
 * How many times a text is measured again at the size it was given, and made smaller still if it does not fit at that size. One is usually
 * enough; a machine that draws text with hinting needs a second, see `fitTexts`.
 */
const MAX_PASSES = 5;

/**
 * A card's width is read as a whole number (`clientWidth`) while its layout is not (a card is 157.75px wide, a word 150.0px), so a word that
 * fills the room to the pixel can still be broken by a fraction of one. This much is kept free.
 */
const ROOM_SLACK = 1;

/**
 * How wide each piece of a text is when it is drawn the way `label` is drawn: its font, its size from the stylesheet, and its language (the
 * same Devanagari word is wider in Marathi than in Hindi, which a canvas does not know). Each piece is put on one line in a hidden copy of the
 * label and measured where it is, so the answer is what the browser will lay out.
 *
 * @param {HTMLElement} label
 * @param {readonly string[]} pieces
 * @param {number} size The font size to measure at, in pixels.
 * @returns {number[]} Pixels, one for each piece.
 */
function widthsOf(label, pieces, size) {
  const parent = label.parentElement;
  if (!parent) throw new GameError('NO_PLACE', 'a text that is not in the page cannot be measured', { text: label.textContent });
  const probes = pieces.map((piece) => {
    const probe = /** @type {HTMLElement} */ (label.cloneNode(false));
    // `cssText` replaces the size an earlier fit left on the label, so a piece is measured at the size asked for. The width is max-content: a
    // box sized "to fit" is held to the room it has (the card), so a word wider than the card would be measured as exactly the card's width.
    probe.style.cssText = 'position: absolute; visibility: hidden; white-space: nowrap; width: max-content; min-width: 0; max-width: none; height: auto; '
      + `margin: 0; padding: 0; border: 0; box-sizing: content-box; inset: 0 auto auto 0; font-size: ${size}px;`;
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
 * A machine that draws text with hinting rounds every glyph's width to whole pixels, so a word's width does not grow in step with its font size
 * (a word that is 83px at 25px is 67px at 19.6px, not 65). A text is therefore measured again at the size it was given, and made smaller still
 * if it does not fit at that size, until it does (or is as small as allowed).
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
      const room = card.clientWidth - parseFloat(cardStyle.paddingLeft) - parseFloat(cardStyle.paddingRight) - ROOM_SLACK;
      // A board that is not on screen has no sizes to fit against; it is fitted when it is next laid out.
      if (!(room > 0)) continue;

      const natural = parseFloat(getComputedStyle(label).fontSize);
      let scale = 1;
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        // How much smaller than it is drawn at now the widest piece has to be to fit (1 when it fits).
        const factor = fitScale(Math.max(...widthsOf(label, pieces, natural * scale)), room, 0);
        const smaller = Math.max(least, scale * factor);
        if (factor === 1 || smaller === scale) break;
        scale = smaller;
      }
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
