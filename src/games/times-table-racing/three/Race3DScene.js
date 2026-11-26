import { RaceScene } from '../scenes/RaceScene.js';
import { logError } from '../../../engine/utils/errors.js';
import { createTrackView3D } from './TrackView3D.js';
import { RACE_LENGTH } from '../logic/levels.js';

/**
 * The race with a 3D track: the same questions, answers, clock, ghost, stars and saved best run as the 2D race (this is the 2D
 * race scene with its track drawing swapped), but the track is seen from behind the player's car, with the ghost see-through in
 * the next lane and a rush of speed on every right answer.
 *
 * If 3D cannot start, or the graphics are lost part-way through, the race does not restart: it simply carries on with the 2D
 * track, from the same place, so a child never loses a race to a graphics problem.
 */
export class Race3DScene extends RaceScene {
  #view = null;

  mountTrack(trackEl) {
    // A class for the 3D race's own layout rules (a tighter answer area on a short phone, so the picture gets its share).
    this.ui.classList.add('race--3d');
    try {
      this.#view = createTrackView3D({ container: trackEl, count: RACE_LENGTH, onContextLost: () => this.#giveUp3d('the graphics were lost') });
    } catch (error) {
      logError(error, 'times-table-racing:3d');
      this.routes.view.fallBack(); // for this visit only
      this.#view = null;
    }
  }

  paintTrack(ctx, rect, state) {
    if (this.#view) this.#view.paint(state);
    else super.paintTrack(ctx, rect, state);
  }

  unmountTrack() {
    this.#view?.dispose();
    this.#view = null;
  }

  /** Drops the 3D picture and lets the 2D track (drawn on the game canvas behind it) show, in the middle of the race. */
  #giveUp3d(reason) {
    logError(new Error(`3D track stopped: ${reason}`), 'times-table-racing:3d');
    this.routes.view.fallBack();
    this.unmountTrack();
  }
}
