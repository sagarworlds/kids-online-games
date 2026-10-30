import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ levelId: 'easy'|'medium'|'hard', index: number, results: { moves: number, par: number, stars: number }[] }} Round
 * @typedef {{
 *   menu: () => void,
 *   play: (round: Round) => void,
 *   results: (round: Round) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 */

/** Base for Lights Out's scenes: a Scene that can navigate. */
export class LightsScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }
}
