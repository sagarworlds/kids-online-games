import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   map: () => void,
 *   puzzle: (params: { levelId: number }) => void,
 *   complete: (params: { levelId: number, result: { blocks: number, collected: number, totalGems: number } }) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{ worlds: import('../logic/levels.js').World[], levels: import('../logic/levels.js').Level[] }} GameData
 * The validated contents of levels.json.
 */

/** Base for Robot Path's scenes: a Scene that can navigate and knows the level data. */
export class RobotScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {GameData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }
}
