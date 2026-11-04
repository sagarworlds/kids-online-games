import { Scene } from '../../../engine/Scene.js';
import { clearedFloors } from '../logic/levels.js';
import { sanitizeMemory, dayNumber } from '../logic/memory.js';

/**
 * @typedef {{ kind: 'challenge'|'revision'|'ladder', floor?: number, levelId: 'easy'|'medium'|'hard',
 *   summary?: ReturnType<import('../logic/session.js').QuizSession['summary']>, mistakes?: number }} RoundResult
 * @typedef {{
 *   menu: () => void,
 *   floor: (floor: number) => void,
 *   learn: (floor: number) => void,
 *   ladder: (floor: number) => void,
 *   quiz: (choice: { mode: 'challenge'|'revision', floor?: number, levelId: 'easy'|'medium'|'hard' }) => void,
 *   results: (result: RoundResult) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 */

/** Base for Table Tower's scenes: a Scene that can navigate and read what the game has saved. */
export class TowerBase extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   */
  constructor(services, routes) {
    super(services);
    this.routes = routes;
  }

  /** The saved progress: best stars for each key, and the game's own data. */
  get save() {
    return this.services.rewards.getSave(this.services.game.slug);
  }

  /** The floors cleared so far. @returns {Set<number>} */
  cleared() {
    return clearedFloors(this.save.bestStars);
  }

  /** What is remembered about each fact; damaged entries are dropped and logged. @returns {import('../logic/memory.js').Memory} */
  memory() {
    return sanitizeMemory(this.save.extra?.memory);
  }

  /** Today as a day number, in the player's own time zone. */
  today() {
    return dayNumber(new Date());
  }
}
