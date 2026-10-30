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
 *   hub: () => void,
 *   play: (params: { levelId: 'easy'|'medium'|'hard', continent: string }) => void,
 *   next: (trip: Trip) => void,
 *   results: (trip: Trip) => void,
 *   passport: () => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
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
