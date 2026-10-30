import { Scene } from '../../../engine/Scene.js';

/**
 * @typedef {{ themeId: string, levelId: 'easy'|'medium'|'hard' }} Choice
 * @typedef {{
 *   themeId: string, levelId: 'easy'|'medium'|'hard',
 *   results: { stars: 1|2|3, score: number, misses: number, elapsed: number, themeId: string, types: string[] }[]
 * }} RoundResult
 * @typedef {{
 *   menu: () => void,
 *   play: (choice: Choice) => void,
 *   results: (result: RoundResult) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{
 *   templates: ReadonlyMap<string, import('../logic/templates.js').Template>,
 *   themes: ReadonlyMap<string, import('../logic/templates.js').Theme>
 * }} SpotData
 */

/** The id that means "a different theme for each picture". */
export const MIX = 'mix';

/** Base for Spot the Difference's scenes: a Scene that can navigate and knows the objects and themes. */
export class SpotBase extends Scene {
  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {SpotData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }

  /** The name of a theme, or of the mix. @param {string} themeId */
  themeName(themeId) {
    return themeId === MIX ? 'Mix of everything' : this.data.themes.get(themeId)?.name ?? themeId;
  }
}
