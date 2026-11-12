import { KitchenScene } from '../scenes/KitchenScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createPizzaView } from '../ui/PizzaView.js';
import { createPizzaView3D } from './PizzaView3D.js';

/**
 * The kitchen with a 3D pizza: the pizza is round and lifts its topped slices, and the child can turn and zoom it. It is the flat kitchen
 * with two parts replaced (the pizza, and how the screen is laid out: the picture on top on a phone, beside the order and the toppings on a
 * wide screen), so the orders, the checking, the hints, the retries, the coins, the bonus question, the stars and the saved progress are the
 * very same code in both views.
 *
 * If 3D cannot start, or the graphics are lost, the pizza carries on in place as the flat pizza with the slices done so far, so a customer
 * is never lost; the visit goes on flat and the 2D view is remembered for the next one (`routes.view.fallBack`).
 */
export class Kitchen3DScene extends KitchenScene {
  makePizzaView({ slices, onToggle }) {
    return createPizzaView3D({
      slices, onToggle,
      createFlat: () => createPizzaView({ slices, onToggle }),
      onFallBack: () => this.routes.view.fallBack(),
    });
  }

  layout({ customer, pizzaView, tray, actions, status, after }) {
    // The toppings sit on the picture, along its bottom edge (the pizza is framed a little above the middle to leave the room), so that the order,
    // the Serve button and the buttons for each slice (the keyboard's way to the slices, and a precise tap on a phone) fit under it on a small phone.
    pizzaView.el.append(tray);
    const panel = el('div', { class: 'scene3d__panel' }, customer, pizzaView.sliceList, actions, status, after);
    return el('main', { class: 'scene3d kitchen3d' }, pizzaView.el, panel);
  }
}
