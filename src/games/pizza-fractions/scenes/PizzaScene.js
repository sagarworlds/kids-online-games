import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   customer: string, summary: string,
 *   status: import('../logic/scoring.js').OrderStatus, coins: number, bonus: boolean|null
 * }} OrderResult  `coins` includes any bonus coins; `bonus` is null when there was no bonus question.
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', orders: import('../logic/orderGenerator.js').Order[],
 *   index: number, results: OrderResult[]
 * }} Round
 * @typedef {{
 *   menu: () => void,
 *   play: (round: Round) => void,
 *   results: (round: Round) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 */

/** Base for Pizza Fractions' scenes: a Scene that can navigate. */
export class PizzaScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }
}
