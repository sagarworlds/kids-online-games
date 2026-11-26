import { MusicScene } from '../scenes/MusicScene.js';
import { createPads3D, layoutAroundPads } from './pads3d.js';

/**
 * Music Maker with 3D pads: the same free play, recording and play-back as the flat Music Maker, on the console of 3D pads (see `Play3DScene`).
 */
export class Music3DScene extends MusicScene {
  createPads(options) {
    return createPads3D(options, () => this.routes.view.fallBack());
  }

  layout({ display, pads, slots, controls, note }) {
    return layoutAroundPads(pads, [display, slots, controls, note]);
  }
}
