import { Scene } from '../../../engine/Scene.js';
import { sanitizePrefs } from '../logic/prefs.js';
import { levelContent } from '../logic/levels.js';
import { Voice } from '../ui/Voice.js';

/**
 * @typedef {import('../logic/devanagari.js').Lang} Lang
 * @typedef {{ activity: 'build'|'bubbles'|'words', levelId: 'easy'|'medium'|'hard', lang: Lang, summary: ReturnType<import('../logic/session.js').RoundSession['summary']> }} RunResult
 * @typedef {{
 *   menu: () => void,
 *   learn: () => void,
 *   run: (choice: { activity: 'build'|'bubbles'|'words', levelId: 'easy'|'medium'|'hard' }) => void,
 *   results: (result: RunResult) => void
 * }} Routes
 * Navigation between this game's scenes, built in `main.js` so scenes never import each other.
 *
 * @typedef {{
 *   words: import('../logic/words.js').WordLists, manifest: import('../logic/audio.js').Manifest
 * }} MatraData
 */

/** Base for Matra Mixer's scenes: navigation, the saved language choice, and the voice. */
export class MatraBase extends Scene {
  #voice = null;

  /**
   * @param {import('../../../engine/Scene.js').Services} services
   * @param {Routes} routes
   * @param {MatraData} data
   */
  constructor(services, routes, data) {
    super(services);
    this.routes = routes;
    this.data = data;
  }

  /** The saved language and vowel-sign choice. @returns {import('../logic/prefs.js').Prefs} */
  prefs() {
    return sanitizePrefs(this.services.rewards.getSave(this.services.game.slug).extra?.prefs);
  }

  /** What is taught at a level, for the saved language and vowel signs. @param {'easy'|'medium'|'hard'} levelId */
  contentFor(levelId) {
    const { lang, vowelSet } = this.prefs();
    return levelContent(levelId, lang, vowelSet);
  }

  /** The voice for the saved language. @returns {Voice} */
  get voice() {
    this.#voice ??= new Voice({
      speech: this.services.speech, settings: this.services.settings, manifest: this.data.manifest, getLang: () => this.prefs().lang,
    });
    return this.#voice;
  }

  exit() {
    this.#voice?.stop();
  }
}
