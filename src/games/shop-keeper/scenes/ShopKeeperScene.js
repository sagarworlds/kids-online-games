import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   customer: string, bill: number, paid: number, changeDue: number,
 *   status: import('../logic/scoring.js').SaleStatus, smart: boolean, pieces: number, fewest: number|null, score: number
 * }} SaleResult
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', sales: import('../logic/saleGenerator.js').Sale[], index: number, results: SaleResult[]
 * }} Round
 * @typedef {{
 *   menu: () => void,
 *   play: (round: Round) => void,
 *   results: (round: Round) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{ currency: import('../logic/currency.js').Currency, items: import('../logic/items.js').Item[] }} ShopData
 */

/** Base for Shop Keeper's scenes: a Scene that can navigate and knows the currency and the item list. */
export class ShopKeeperScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {ShopData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }
}
