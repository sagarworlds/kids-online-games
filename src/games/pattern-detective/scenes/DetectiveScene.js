import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ type: string, firstTry: boolean, wrongPicks: number }} CaseResult
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', puzzles: import('../logic/puzzle.js').Puzzle[], index: number, results: CaseResult[]
 * }} Round
 * @typedef {{
 *   menu: () => void,
 *   play: (round: Round) => void,
 *   results: (round: Round) => void,
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void, fallBack: () => void }
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other. `view` is the child's choice of 3D or 2D
 * (see `engine/three/view.js`).
 */

/** Base for Pattern Detective's scenes: a Scene that can navigate. */
export class DetectiveScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }
}
