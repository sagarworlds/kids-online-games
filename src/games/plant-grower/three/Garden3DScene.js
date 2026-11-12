import { GardenScene } from '../scenes/GardenScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createPlantArt } from '../ui/PlantArt.js';
import { createPlantStage3D } from './PlantStage3D.js';

/**
 * The garden in 3D: the plant grows in a pot the child can turn and zoom, the sun crosses the sky as the day is lived, and clouds, rain
 * and a hot sun show the weather. It is the 2D garden with two parts replaced (the picture, and how the screen is laid out: the picture
 * on top on a phone, beside the sliders on a wide screen), so the week's weather, the sliders, the simulation, the hints, the stars and
 * the saved progress are the very same code in both views.
 *
 * If 3D cannot start, or the graphics are lost, the picture carries on in place as the flat plant, so a week half grown is never lost;
 * the visit goes on flat and the 2D view is remembered for next time (`routes.view.fallBack`).
 */
export class Garden3DScene extends GardenScene {
  createArt(plant) {
    return createPlantStage3D({
      plant,
      createFlat: () => createPlantArt(plant, { size: 210 }),
      onFallBack: () => this.routes.view.fallBack(),
    });
  }

  layout({ banner, bubble, art, health, meter, controls, summary, nextButton }) {
    // The thought bubble rides on top of the picture, as it does on the flat plant's box.
    art.el.append(bubble);
    const vitals = el('div', { class: 'garden3d__vitals' }, health, meter.el);
    const panel = el('div', { class: 'scene3d__panel' }, banner, vitals, controls, summary, el('div', { class: 'garden__actions' }, nextButton));
    return { main: el('main', { class: 'scene3d garden3d' }, art.el, panel), stageEl: null };
  }
}
