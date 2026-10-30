import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ type: string, firstTry: boolean, wrongPicks: number }} CaseResult
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', puzzles: import('../logic/puzzle.js').Puzzle[], index: number, results: CaseResult[]
 * }} Round
 * @typedef {{
 *   menu: () => void,
 *   play: (round: Round) => void,
 *   results: (round: Round) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
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
