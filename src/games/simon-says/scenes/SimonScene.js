import { Scene } from '../../../engine/Scene.js';
import { createPadBoard } from '../ui/PadBoard.js';

/**
 * @typedef {{
 *   menu: () => void,
 *   play: (params: { levelId: 'easy'|'medium'|'hard', mode: 'classic'|'reverse' }) => void,
 *   music: (params: { levelId: 'easy'|'medium'|'hard' }) => void,
 *   results: (params: { levelId: string, mode: 'classic'|'reverse', longest: number }) => void,
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void, fallBack: () => void }
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other. `view` is the child's choice of 3D or 2D
 * (see `engine/three/view.js`).
 */

/** Base for Simon Says' scenes: a Scene that can navigate. */
export class SimonScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }

  /**
   * Makes the pads the child plays. The 3D scenes override this. Whatever it makes has to offer what `createPadBoard` offers (`el`, `light`,
   * `setEnabled`), and may also offer `tick`, `draw` and `dispose` (the 3D pads animate and hold graphics memory).
   * @param {{ pads: readonly import('../logic/pads.js').Pad[], onPress: (padId: number) => void }} options
   */
  createPads(options) {
    return createPadBoard(options);
  }
}
