import { PlayScene } from '../scenes/PlayScene.js';
import { logError } from '../../../engine/utils/errors.js';
import { createStarField3D } from './StarField3D.js';

/**
 * Number Ninja with a 3D sky: the stars are chunky gold solids that spin as they fall, a right answer splits one in two in a burst of sparks, and a star that
 * lands shows its answer on a plate. It is the flat play scene with its sky drawn differently (the rules, the typing, the number pad, the hints, the
 * scores, the stars and the sounds are the very same code), so a round plays and scores the same in both views.
 *
 * The camera is fixed: a falling game must not be turned away from the child, and the 3D is in the stars (their solid shape, their spin, the way they split).
 *
 * If 3D cannot start, or the graphics are lost part-way through, the round does not restart: the flat sky is drawn again on the game canvas from the same
 * state, so a child never loses a round to a graphics problem; the visit goes on flat and the 2D view is remembered for the next one (`routes.view.fallBack`).
 */
export class Play3DScene extends PlayScene {
  createView({ lanes }) {
    try {
      return createStarField3D({
        lanes,
        onContextLost: () => {
          logError(new Error('3D sky stopped: the graphics were lost'), 'number-ninja:3d');
          this.routes.view.fallBack(); // for this visit only
        },
      });
    } catch (error) {
      logError(error, 'number-ninja:3d');
      this.routes.view.fallBack();
      return null;
    }
  }
}
