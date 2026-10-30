import { GameError } from '../utils/errors.js';
import { gameKey, saveSchema } from './schemas.js';

/** @typedef {import('./schemas.js').SaveData} SaveData */

/**
 * Stars and badges, persisted per game under `kidsgames:<slug>`.
 * Depends on the StorageService interface only.
 */
export class RewardService {
  #storage;

  /** @param {{ storage: import('./StorageService.js').StorageService }} deps */
  constructor({ storage }) {
    this.#storage = storage;
  }

  /** @param {string} slug @returns {SaveData} */
  getSave(slug) {
    return this.#storage.read(gameKey(slug), saveSchema);
  }

  /**
   * Records a finished round, keeping the best result per level.
   * @param {string} slug
   * @param {string} levelKey Level id, e.g. 'easy' or 'level-12'.
   * @param {{ stars: number, score?: number }} result
   * @returns {{ save: SaveData, improvedStars: boolean, improvedScore: boolean }}
   * @throws {GameError} With code 'BAD_STARS' unless stars is a whole number from 1 to 3.
   */
  recordRound(slug, levelKey, { stars, score = 0 }) {
    if (![1, 2, 3].includes(stars)) {
      throw new GameError('BAD_STARS', `stars must be 1, 2 or 3 (got ${stars})`, { slug, levelKey, stars });
    }
    const save = this.getSave(slug);
    const previous = save.bestStars[levelKey] ?? 0;
    const improvedStars = stars > previous;
    const improvedScore = score > save.bestScore;
    if (improvedStars) save.bestStars[levelKey] = stars;
    if (improvedScore) save.bestScore = score;
    // Always write: it marks the game as "played" even when nothing improved.
    this.#storage.write(gameKey(slug), save);
    return { save, improvedStars, improvedScore };
  }

  /**
   * Lets a game keep its own data (unlocked levels, weights...) in its save.
   * @param {string} slug
   * @param {(save: SaveData) => void} mutate Edits `save.extra` (or other fields) in place.
   * @returns {SaveData}
   */
  update(slug, mutate) {
    const save = this.getSave(slug);
    mutate(save);
    this.#storage.write(gameKey(slug), save);
    return save;
  }

  /**
   * Awards a badge once.
   * @param {string} slug
   * @param {string} badgeId
   * @returns {boolean} True if the badge is new.
   */
  awardBadge(slug, badgeId) {
    const save = this.getSave(slug);
    if (save.badges.includes(badgeId)) return false;
    save.badges.push(badgeId);
    this.#storage.write(gameKey(slug), save);
    return true;
  }

  /** @param {string} slug @returns {number} Sum of best stars over all levels. */
  starsFor(slug) {
    return Object.values(this.getSave(slug).bestStars).reduce((sum, s) => sum + s, 0);
  }

  /** @param {readonly string[]} slugs @returns {number} Stars across every listed game. */
  totalStars(slugs) {
    return slugs.reduce((sum, slug) => sum + this.starsFor(slug), 0);
  }

  /**
   * "New" badge rule on the hub: nothing has been recorded for this game yet.
   * @param {string} slug
   * @returns {boolean}
   */
  hasPlayed(slug) {
    const save = this.getSave(slug);
    return Object.keys(save.bestStars).length > 0 || save.bestScore > 0 || save.badges.length > 0;
  }
}
