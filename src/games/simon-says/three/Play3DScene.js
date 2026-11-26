import { PlayScene } from '../scenes/PlayScene.js';
import { createPads3D, layoutAroundPads } from './pads3d.js';

/**
 * Simon Says (Classic and Reverse) with 3D pads: a console with a big pad for each colour that goes down like a pressed button and glows when it lights,
 * which the child can turn and zoom. It is the flat game with two parts replaced (the pads, and how the screen is laid out), so the sequences, the sound
 * and light show, the answer clock, the retry, the Replay, the scores, the stars and the saved progress are the very same code in both views.
 *
 * If 3D cannot start, or the graphics are lost, the picture goes and the flat pads are the board again, so a game is never lost; the visit goes on flat
 * and the 2D view is remembered for the next one (`routes.view.fallBack`).
 */
export class Play3DScene extends PlayScene {
  createPads(options) {
    return createPads3D(options, () => this.routes.view.fallBack());
  }

  layout({ display, pads, timer, controls, note }) {
    return layoutAroundPads(pads, [display, timer, controls, note]);
  }
}
