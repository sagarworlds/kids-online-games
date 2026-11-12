import { AmbientLight, DirectionalLight, Color, Mesh, CircleGeometry, MeshBasicMaterial } from '../../../engine/three/three.js';
import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { approach } from '../../../engine/three/motionMath.js';
import { el } from '../../../engine/utils/dom.js';
import { logError } from '../../../engine/utils/errors.js';
import { toppingById } from '../logic/toppings.js';
import { sliceAtPoint } from '../logic/pizza.js';
import { sliceLift, startView, PIZZA_RADIUS } from '../logic/look3d.js';
import { createPizzaKit, buildSlice, setSliceTopping, buildTable } from './pizzaModels.js';

/**
 * The pizza in 3D: the same view as the flat `PizzaView` (the scene gives it the pizza to show and hears which slice was tapped), drawn as
 * a round pizza on a plate that the child can turn and zoom. A slice with a topping lifts and tips up, and its pieces (a spotted disc, a ring,
 * a cap and stem, a wedge: each topping has its own shape, not only its colour) drop onto it. A slice flagged by a wrong serve also bobs and
 * gets red dashes round its edge.
 *
 * A picture cannot be reached with a keyboard, so the view also gives `sliceList`: one button for each slice, which says what is on it and
 * puts the chosen topping on it, like the flat pizza's slices do. The scene puts it under the picture.
 *
 * If 3D cannot start, or the graphics are lost, the picture carries on in the same place as the flat pizza, with what had been done so far.
 *
 * @typedef {{
 *   el: HTMLElement,
 *   sliceList: HTMLElement,
 *   render: (pizza: (string|null)[], state?: { off?: readonly number[], locked?: boolean }) => void,
 *   focusSlice: (index: number) => void,
 *   tick: (dt: number) => void,
 *   draw: () => void,
 *   dispose: () => void
 * }} PizzaView3D
 */

const LIMITS = Object.freeze({ minPolar: 0.3, maxPolar: 1.45, minDistance: 6, maxDistance: 19 });
/** How quickly slices lift and pieces land, as the rate for `approach` (higher is quicker). */
const LIFT_RATE = 12;
const DROP_RATE = 14;
const DROP_HEIGHT = 0.9;

/**
 * @param {{
 *   slices: number,
 *   onToggle: (index: number) => void,
 *   createFlat: () => { el: HTMLElement, render: Function, focusSlice: Function },
 *   onFallBack: () => void
 * }} options `createFlat` makes the flat pizza used if 3D cannot run; `onFallBack` is told when that happens.
 * @returns {PizzaView3D}
 */
export function createPizzaView3D({ slices, onToggle, createFlat, onFallBack }) {
  const container = el('div', { class: 'scene3d__stage pizza3d' });
  let pizza = Array(slices).fill(null);
  let flagged = new Set();
  let locked = false;
  let flat = null;
  let view = null;

  const toggle = (index) => { if (!locked) onToggle(index); };

  // ---- the buttons: the way in for the keyboard and screen readers, and a precise tap on a phone
  const chips = Array.from({ length: slices }, (_, i) => el('button', { class: 'slicebar__chip', attrs: { type: 'button' }, on: { click: () => toggle(i) } },
    el('span', { class: 'slicebar__number', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'slicebar__topping', attrs: { 'aria-hidden': 'true' } })));
  const sliceList = el('div', { class: 'slicebar', attrs: { role: 'group', 'aria-label': `The ${slices} slices` } }, ...chips);

  function drawChips() {
    chips.forEach((chip, i) => {
      const topping = pizza[i];
      chip.querySelector('.slicebar__topping').textContent = topping ? toppingById(topping).icon : '';
      chip.classList.toggle('is-topped', Boolean(topping));
      chip.classList.toggle('is-off', flagged.has(i));
      chip.disabled = locked;
      chip.setAttribute('aria-label', `Slice ${i + 1} of ${slices}: ${topping ? toppingById(topping).label : 'no topping'}${flagged.has(i) ? ', check this one' : ''}`);
    });
  }

  function degrade(reason) {
    logError(new Error(`3D pizza stopped: ${reason}`), 'pizza-fractions:3d');
    view?.dispose();
    view = null;
    flat = createFlat();
    container.append(flat.el);
    container.classList.add('pizza3d--flat');
    flat.render(pizza, { off: [...flagged], locked });
    onFallBack();
  }

  const models = [];
  // An invisible disc under the slices, the size of the pizza: a tap that passes between slices lands on it.
  const catcher = new Mesh(new CircleGeometry(PIZZA_RADIUS, 32), new MeshBasicMaterial({ visible: false }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.1;
  const shown = Array(slices).fill(undefined); // what each slice's pieces were built for, so a slice is only rebuilt when its topping changes
  let kit = null;
  let clock = 0;

  try {
    view = new OrbitStage({
      container, background: '#fff1d6', fov: 40, near: 0.1, far: 120, limits: LIMITS,
      label: `3D pizza cut into ${slices} slices. Tap a slice to put the chosen topping on it, drag to turn the pizza. The buttons under the picture do the same.`,
      orbit: (() => { const { azimuth, polar, distance } = startView(); return { azimuth, polar, distance }; })(),
      target: startView().target,
      onContextLost: () => degrade('the graphics were lost'),
      onTap: ({ clientX, clientY }) => {
        if (locked || !view) return;
        const hit = view.stage.pick(clientX, clientY, [...models.flatMap((m) => m.pickable), catcher])[0];
        if (!hit) return;
        if (hit.object.userData.slice !== undefined) { toggle(hit.object.userData.slice); return; }
        // The tap fell in a cut between two slices (or on a slice that has lifted away): the flat pizza's own rule says which slice owns that
        // spot, so a finger that lands a little off is not wasted.
        const index = sliceAtPoint(hit.point.x, hit.point.z, { cx: 0, cy: 0, radius: PIZZA_RADIUS }, slices);
        if (index !== null) toggle(index);
      },
    });
  } catch (error) {
    logError(error, 'pizza-fractions:3d');
    degrade('3D could not start');
  }

  if (view) {
    const { scene, quality } = view.stage;
    scene.fog = null;
    scene.background = new Color('#fff1d6');
    scene.add(new AmbientLight('#ffffff', Math.PI * 0.6));
    const sun = new DirectionalLight('#ffffff', Math.PI * 0.62);
    sun.position.set(4, 10, 7);
    scene.add(sun, buildTable(), catcher);
    kit = createPizzaKit(slices, quality);
    for (let i = 0; i < slices; i++) {
      const model = buildSlice(kit, i);
      Object.assign(model, { rise: 0, tilt: 0, drop: 1 });
      models.push(model);
      scene.add(model.group);
    }
  }

  /** Brings the picture in line with the pizza: new pieces where a topping changed, red dashes where a slice is flagged. */
  function apply({ snap = false } = {}) {
    models.forEach((model, i) => {
      if (shown[i] !== pizza[i]) {
        setSliceTopping(kit, model, i, pizza[i]);
        // A new topping drops onto the slice (from just above it); with less motion, or when the picture is first drawn, it is just there.
        model.drop = pizza[i] && !snap && !view.reducedMotion ? 0 : 1;
        shown[i] = pizza[i];
      }
      model.dashes.visible = flagged.has(i);
    });
  }

  return {
    el: container,
    sliceList,
    render(next, { off = [], locked: isLocked = false } = {}) {
      pizza = next.slice();
      flagged = new Set(off);
      locked = isLocked;
      drawChips();
      container.classList.toggle('is-locked', locked);
      if (flat) flat.render(pizza, { off: [...flagged], locked });
      else if (view) apply();
    },
    focusSlice(index) {
      chips[index]?.focus({ preventScroll: true });
    },
    tick(dt) {
      if (!view) return;
      view.update(dt);
      clock += dt;
      const calm = view.reducedMotion;
      models.forEach((model, i) => {
        const target = sliceLift({ topped: Boolean(pizza[i]), flagged: flagged.has(i), clock, still: calm });
        model.rise = calm ? target.rise : approach(model.rise, target.rise, dt, LIFT_RATE);
        model.tilt = calm ? target.tilt : approach(model.tilt, target.tilt, dt, LIFT_RATE);
        model.drop = calm ? 1 : approach(model.drop, 1, dt, DROP_RATE);
        model.lifter.position.y = model.rise;
        model.lifter.rotation.x = model.tilt;
        model.toppings.position.y = (1 - model.drop) * DROP_HEIGHT;
      });
    },
    draw() { view?.render(); },
    dispose() { view?.dispose(); view = null; },
  };
}
