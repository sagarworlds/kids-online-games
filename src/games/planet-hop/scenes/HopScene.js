import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {'lineup'|'weigh'|'quiz'} ModeId
 * @typedef {{ mode: ModeId, levelId: 'easy'|'medium'|'hard', resume?: { kg: number, who: string } }} PlayChoice
 * `resume` is for the weigh-in only: when a child is moved between the 3D and 2D views, or 3D has to step aside, the
 * weight they already entered is carried over in memory (it is still never saved) so they do not type it twice.
 * @typedef {{
 *   mode: ModeId, levelId: 'easy'|'medium'|'hard', stars: 1|2|3, score: number, lines: string[]
 * }} RoundResult  What a mode hands to the results screen; `lines` are short sentences about how the round went.
 * @typedef {{
 *   menu: () => void,
 *   play: (choice: PlayChoice) => void | Promise<void>,
 *   results: (result: RoundResult) => void,
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void },
 *   fallBack: (choice: PlayChoice) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other. `play` opens a mode in
 * the child's chosen view (3D or 2D); `view` is what the menu and the 3D scenes use to show and change that choice;
 * `fallBack` is for a 3D scene that cannot go on: it opens the same mode in 2D for the rest of the visit, without
 * changing what the child chose.
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
