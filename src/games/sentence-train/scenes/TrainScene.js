import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ order: number, punctuation: number, extra: number }} MistakeCounts
 * @typedef {{ id: string, text: string, status: import('../logic/scoring.js').SentenceStatus, mistakes: MistakeCounts }} SentenceResult
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', entries: import('../logic/sentences.js').SentenceEntry[],
 *   index: number, results: SentenceResult[], hintsLeft: number
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

/** Base for Sentence Train's scenes: a Scene that can navigate and knows the sentences. */
export class TrainScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {{ sentences: import('../logic/sentences.js').SentenceEntry[] }} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }
}
