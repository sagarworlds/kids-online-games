import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   plant: import('../logic/plants.js').PlantType, levelId: 'easy'|'medium'|'hard',
 *   state: import('../logic/simulation.js').PlantState, seed: number
 * }} RoundResult
 * @typedef {{
 *   menu: () => void,
 *   play: (choice: { plantId: string, levelId: 'easy'|'medium'|'hard' }) => void,
 *   results: (result: RoundResult) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{ plants: import('../logic/plants.js').PlantType[] }} PlantData
 */

/** Base for Plant Grower's scenes: a Scene that can navigate and knows the plant types. */
export class PlantScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {PlantData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }

  /** @param {string} id @returns {import('../logic/plants.js').PlantType|undefined} */
  plant(id) {
    return this.data.plants.find((p) => p.id === id);
  }
}
