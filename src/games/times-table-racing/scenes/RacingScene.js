import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ levelId: 'easy'|'medium'|'hard', tables: number[] }} RaceSetup
 * @typedef {RaceSetup & {
 *   summary: import('../logic/race.js').RaceSummary,
 *   ghost: { run: import('../logic/ghost.js').GhostRun, isDefault: boolean }
 * }} RaceOutcome
 * @typedef {{
 *   menu: () => void,
 *   play: (setup: RaceSetup) => void | Promise<void>,
 *   results: (outcome: RaceOutcome) => void,
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void, fallBack: () => void }
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other. `play` opens the race in the
 * child's chosen view (3D or 2D); `view` is what the menu uses to show and change that choice, and what a 3D race uses to say
 * "carry on in 2D for the rest of this visit" (`fallBack`) without changing what the child chose.
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
