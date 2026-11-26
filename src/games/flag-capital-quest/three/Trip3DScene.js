import { TripScene } from '../scenes/TripScene.js';
import { createGlobeMap } from './GlobeMap.js';

/**
 * A trip with the globe: the same questions, answers, progress and stars as the 2D trip (this is the 2D trip scene with its
 * map swapped), but the map is a globe the child can spin and zoom. After an answer the globe turns to the country, a plane
 * flies the great-circle route to it, and it gets a pin; on a map question the child taps the country on the globe.
 *
 * If 3D cannot start, `createGlobeMap` throws out of `enter()` and `main.js` opens the 2D trip instead. If the graphics are
 * lost during the trip, the same trip carries on in 2D from the same question.
 */
export class Trip3DScene extends TripScene {
  #globe = null;

  createMap(options) {
    this.#globe = createGlobeMap({ ...options, onContextLost: () => this.routes.fallBack.trip(this.trip) });
    return this.#globe;
  }

  layoutClass() {
    return ' trip--globe';
  }

  update(dt) {
    this.#globe?.update(dt);
  }

  render() {
    this.#globe?.render();
  }
}
