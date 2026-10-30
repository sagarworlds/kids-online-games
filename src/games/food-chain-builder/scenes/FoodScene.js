import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{
 *   habitat: import('../logic/habitats.js').Habitat, stars: 1|2|3, builderStars: 1|2|3, wrongAtFirstCheck: number,
 *   whatIf: { correct: number, total: number }|null
 * }} RoundResult
 * @typedef {{
 *   menu: () => void,
 *   build: (choice: { habitatId: string }) => void,
 *   whatIf: (round: { habitat: import('../logic/habitats.js').Habitat, builderStars: 1|2|3, wrongAtFirstCheck: number }) => void,
 *   results: (result: RoundResult) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{
 *   organisms: import('../logic/organisms.js').Organism[], lookup: Map<string, import('../logic/organisms.js').Organism>,
 *   places: import('../logic/habitats.js').Place[], habitats: import('../logic/habitats.js').Habitat[]
 * }} FoodData
 */

/** Base for Food Chain Builder's scenes: a Scene that can navigate and knows the organisms and habitats. */
export class FoodScene extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {FoodData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }

  /** @param {string} id @returns {import('../logic/habitats.js').Habitat|undefined} */
  habitat(id) {
    return this.data.habitats.find((h) => h.id === id);
  }

  /** @param {string} placeId @returns {import('../logic/habitats.js').Place|undefined} */
  place(placeId) {
    return this.data.places.find((p) => p.id === placeId);
  }
}
