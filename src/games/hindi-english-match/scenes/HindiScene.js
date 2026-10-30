import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   menu: () => void,
 *   play: (params: { levelId: 'easy'|'medium'|'hard', topic: string, peek: boolean }) => void,
 *   results: (params: { levelId: string, topic: string, peek: boolean, moves: number, seconds: number, pairs: object[] }) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{ topics: string[], pairs: import('../logic/pairs.js').WordPair[] }} GameData
 */

/** Base for this game's scenes: a Scene that can navigate and knows the vocabulary. */
export class HindiScene extends Scene {
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
