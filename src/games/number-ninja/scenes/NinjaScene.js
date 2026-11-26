import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   menu: () => void,
 *   play: (params: { levelId: 'easy'|'medium'|'hard', ops: string[] }) => void,
 *   results: (params: { summary: object }) => void,
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void, fallBack: () => void }
 * }} Routes
 * Navigation between this game's scenes. `main.js` builds it, so scenes never
 * import each other (no circular imports) and can be tested in isolation.
 * `view` is the child's choice of 3D or 2D (see `engine/three/view.js`).
 */

/** Base for this game's scenes: a Scene that also knows how to move to another one. */
export class NinjaScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }
}
