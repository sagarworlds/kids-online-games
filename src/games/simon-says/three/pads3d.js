import { el } from '../../../engine/utils/dom.js';
import { createPadBoard } from '../ui/PadBoard.js';
import { createPadBoard3D } from './PadBoard3D.js';

/**
 * What the two 3D scenes (the game and Music Maker) share: how the pads are made, and how the screen is laid out around the picture of them.
 * The flat pads are made first and are always in the page; the 3D board lays their buttons over its picture (or, if 3D stops, gives them back).
 */

/**
 * @param {{ pads: readonly import('../logic/pads.js').Pad[], onPress: (padId: number) => void }} options
 * @param {() => void} onFallBack Told when 3D stops (the scene tells `routes.view`).
 * @returns {import('./PadBoard3D.js').PadBoard3D}
 */
export function createPads3D({ pads, onPress }, onFallBack) {
  const controls = createPadBoard({ pads, onPress });
  return createPadBoard3D({ pads, controls, onPress, onFallBack });
}

/**
 * The picture of the pads on top (at least 45% of the height on a phone, beside the controls on a wide screen) and everything else in a panel.
 * @param {{ el: HTMLElement }} pads
 * @param {(Node|null)[]} panel What goes in the panel, in order.
 * @returns {HTMLElement}
 */
export function layoutAroundPads(pads, panel) {
  return el('div', { class: 'scene3d simon3d' }, pads.el, el('div', { class: 'scene3d__panel' }, ...panel));
}
