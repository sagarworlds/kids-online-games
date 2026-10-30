import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   menu: () => void,
 *   play: (params: { levelId: 'easy'|'medium'|'hard', mode: 'classic'|'reverse' }) => void,
 *   music: (params: { levelId: 'easy'|'medium'|'hard' }) => void,
 *   results: (params: { levelId: string, mode: 'classic'|'reverse', longest: number }) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
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
}
