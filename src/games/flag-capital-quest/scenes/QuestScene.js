import { Scene } from '../../../engine/Scene.js';
import { byCode } from '../logic/countries.js';

/**
 * @typedef {{ code: string, type: import('../logic/levels.js').QuestionType, correct: boolean }} AnswerRecord
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', continent: import('../logic/continents.js').Continent|'world',
 *   questions: import('../logic/questionFactory.js').Question[], index: number, results: AnswerRecord[],
 *   startProgress: import('../logic/progress.js').Progress
 * }} Trip
 * @typedef {{
 *   hub: () => void | Promise<void>,
 *   play: (params: { levelId: 'easy'|'medium'|'hard', continent: string }) => void | Promise<void>,
 *   next: (trip: Trip) => void | Promise<void>,
 *   results: (trip: Trip) => void,
 *   passport: () => void,
 *   view: { supported: boolean, mode: () => '3d'|'2d', choose: (mode: '3d'|'2d') => void },
 *   fallBack: { hub: () => void, trip: (trip: Trip) => void }
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other. `hub`, `play` and `next`
 * open the hub or a trip in the child's chosen view (3D or 2D); `view` is what the hub uses to show and change that
 * choice; `fallBack` is for a 3D scene that cannot go on: it opens the same hub or trip in 2D for the rest of the visit,
 * without changing what the child chose.
 *
 * @typedef {{
 *   countries: import('../logic/countries.js').Country[], world: import('../ui/worldData.js').World,
 *   progress: import('./ProgressStore.js').ProgressStore, brokenFlags: Set<string>
 * }} QuestData
 */

/** Base for Flag & Capital Quest's scenes: a Scene that can navigate and knows the countries, the map and the progress. */
export class QuestScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {QuestData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
    this.index = byCode(data.countries);
  }
}
