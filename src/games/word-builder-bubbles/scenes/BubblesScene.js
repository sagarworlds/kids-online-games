import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ word: string, emoji: string, mistakes: number }} WordResult
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', packId: string,
 *   words: import('../logic/words.js').WordEntry[], index: number, results: WordResult[], hintsLeft: number
 * }} Round
 * @typedef {{
 *   menu: () => void,
 *   play: (round: Round) => void,
 *   results: (round: Round) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 */

/** Base for Word Builder Bubbles' scenes: a Scene that can navigate and knows the word packs. */
export class BubblesScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {import('../logic/words.js').WordData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }
}
