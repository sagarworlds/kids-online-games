import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ levelId: 'easy'|'medium'|'hard', tables: number[] }} RaceSetup
 * @typedef {RaceSetup & {
 *   summary: import('../logic/race.js').RaceSummary,
 *   ghost: { run: import('../logic/ghost.js').GhostRun, isDefault: boolean }
 * }} RaceOutcome
 * @typedef {{
 *   menu: () => void,
 *   play: (setup: RaceSetup) => void,
 *   results: (outcome: RaceOutcome) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 */

/** Base for Times-Table Racing's scenes: a Scene that can navigate. */
export class RacingScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }
}
