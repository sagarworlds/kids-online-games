import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {'lineup'|'weigh'|'quiz'} ModeId
 * @typedef {{
 *   mode: ModeId, levelId: 'easy'|'medium'|'hard', stars: 1|2|3, score: number, lines: string[]
 * }} RoundResult  What a mode hands to the results screen; `lines` are short sentences about how the round went.
 * @typedef {{
 *   menu: () => void,
 *   play: (choice: { mode: ModeId, levelId: 'easy'|'medium'|'hard' }) => void,
 *   results: (result: RoundResult) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{
 *   planets: import('../logic/planets.js').Planet[], bonus: import('../logic/planets.js').Bonus[],
 *   stops: (import('../logic/planets.js').Planet|import('../logic/planets.js').Bonus)[],
 *   quiz: import('../logic/quiz.js').QuizItem[], presets: import('../logic/presets.js').Preset[]
 * }} HopData  `stops` are the places the weigh-in visits: the planets with the Moon after Earth.
 */

/** Base for Planet Hop's scenes: a Scene that can navigate and knows the planets, quiz and presets. */
export class HopScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {HopData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }
}
