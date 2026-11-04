import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ id: string, char: string, stars: 1|2|3, score: number, mistakes: number }} GlyphResult
 * @typedef {{ setId: string, levelId: 'easy'|'medium'|'hard', results: GlyphResult[] }} RoundResult
 * @typedef {{
 *   menu: () => void,
 *   trace: (choice: { setId: string, levelId: 'easy'|'medium'|'hard' }) => void,
 *   worksheet: (setId: string) => void,
 *   results: (result: RoundResult) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 */

/** Base for Trace Trail's scenes: a Scene that can navigate. */
export class TraceBase extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }
}
