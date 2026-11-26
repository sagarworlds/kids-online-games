import { CaseScene } from '../scenes/CaseScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createCaseView3D } from './CaseView3D.js';

/**
 * The case with a 3D picture: the items of the sequence stand on pedestals as solids that turn on the spot, which the child can turn and zoom, and
 * a tap on a solid says what it is. It is the flat case with a picture added (and the screen laid out for it: the picture on top on a phone, beside
 * the cards on a wide screen), so the cases, the answers, the hints, the stars and the saved progress are the very same code in both views.
 *
 * The flat strip of items stays in the page, in step with the case, for screen readers; it is hidden only while the picture is showing. If 3D
 * cannot start, or the graphics are lost, the picture goes and the strip is shown again, so a case is never lost; the visit goes on flat and the
 * 2D view is remembered for the next one (`routes.view.fallBack`).
 */
export class Case3DScene extends CaseScene {
  #main = null;
  #flat = false;

  createView(puzzle) {
    return createCaseView3D({
      puzzle,
      onName: (text) => this.announce(text),
      onFallBack: () => {
        this.#flat = true;
        this.#main?.classList.add('case3d--flat');
        this.routes.view.fallBack();
      },
    });
  }

  layout({ file, hintBox, options, after, announcer, view }) {
    const panel = el('div', { class: 'scene3d__panel' }, file, hintBox, options, after, announcer);
    this.#main = el('div', { class: `scene3d case3d${this.#flat ? ' case3d--flat' : ''}` }, view.el, panel);
    return this.#main;
  }
}
