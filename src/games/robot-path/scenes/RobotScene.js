import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ levelId: number, resume?: { program: import('../logic/interpreter.js').Program } }} PuzzleParams
 * `resume` carries the blocks a child had built when they switch between the 3D and 2D views.
 *
 * @typedef {{
 *   map: () => void,
 *   puzzle: (params: PuzzleParams) => void | Promise<void>,
 *   complete: (params: { levelId: number, result: { blocks: number, collected: number, totalGems: number } }) => void,
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void },
 *   fallBack: (params: PuzzleParams) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other. `puzzle` opens a level in
 * the child's chosen view (3D or 2D); `view` is what the map and the 3D puzzle use to show and change that choice;
 * `fallBack` is for a 3D puzzle that cannot go on: it opens the same level in 2D for the rest of the visit, without
 * changing what the child chose.
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
