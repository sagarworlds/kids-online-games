import { StationScene } from '../scenes/StationScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createTrainView3D } from './TrainView3D.js';

/**
 * The station with a 3D toy train: the engine and a place on the track for each word, with the carriages the child puts in the slots shown on it, a padlock on a
 * hinted one and a red cross on one in the wrong place, and the whole train rolling away with puffs of steam when the sentence is right. It is the flat station with the
 * track drawn differently (and the screen laid out for it: the picture on top on a phone, beside the siding and the buttons on a wide screen), so the sentences,
 * the dragging, tapping and keys, the siding, the hints, the whistle, the retries, the stars and the saved progress are the very same code in both views.
 *
 * The slots stay in the page, laid over the picture, invisible except for the slot a carriage is dragged over; the siding is the page's too. If 3D cannot start, or the
 * graphics are lost part-way through, the picture goes and the slots go back into the flat yard, with the carriages in them as they were, so a sentence is never lost; the
 * visit goes on flat and the 2D view is remembered for the next one (`routes.view.fallBack`).
 */
export class Station3DScene extends StationScene {
  #flat = false;
  #parts = null;

  createView({ slots, train }) {
    return createTrainView3D({
      slots, train,
      onFallBack: () => {
        this.#flat = true;
        // Put the train back in the flat yard (if the layout has been made; if not, `layout` builds the flat station).
        if (this.#parts) {
          this.#parts.yard.append(this.#parts.train);
          this.#parts.yard.hidden = false;
        }
        this.routes.view.fallBack();
      },
    });
  }

  layout(parts) {
    if (this.#flat) return super.layout(parts);
    this.#parts = parts;
    const { top, yard, siding, actions, note, status, after, announcer, view } = parts;
    yard.hidden = true; // the train is on the 3D track; the yard is where it goes back to if 3D stops
    const panel = el('div', { class: 'scene3d__panel' }, top, yard, siding, actions, note, status, after, announcer);
    return el('main', { class: 'scene3d station3d' }, view.el, panel);
  }
}
