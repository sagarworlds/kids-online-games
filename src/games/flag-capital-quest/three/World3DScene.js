import { WorldScene } from '../scenes/WorldScene.js';
import { createGlobeMap } from './GlobeMap.js';

/**
 * The world hub with the globe: how much of each continent is explored, shown on a globe the child can spin (every explored
 * country has a pin), with the same level picker, continents and passport as the 2D hub.
 *
 * If 3D cannot start, `createGlobeMap` throws out of `enter()` and `main.js` opens the 2D hub instead. If the graphics are
 * lost, the 2D hub opens.
 */
export class World3DScene extends WorldScene {
  #globe = null;

  createMap(options) {
    this.#globe = createGlobeMap({ ...options, onContextLost: () => this.routes.fallBack.hub() });
    return this.#globe;
  }

  layoutClass() {
    return ' hub--globe';
  }

  update(dt) {
    this.#globe?.update(dt);
  }

  render() {
    this.#globe?.render();
  }
}
