import { sanitizeProgress } from '../logic/progress.js';

/**
 * Keeps the child's exploration (which countries have been answered right, how often) in their saved data, under
 * `extra.progress`, so the explored map and the passport are the same after a reload.
 *
 * Takes the reward service as a dependency, so it works with anything that can read and update a save.
 */
export class ProgressStore {
  #rewards;
  #slug;
  #validCodes;

  /**
   * @param {{ rewards: import('../../../engine/services/RewardService.js').RewardService, slug: string, codes: Iterable<string> }} options
   */
  constructor({ rewards, slug, codes }) {
    this.#rewards = rewards;
    this.#slug = slug;
    this.#validCodes = new Set(codes);
  }

  /** @returns {import('../logic/progress.js').Progress} Saved progress, cleaned of anything unknown or damaged. */
  load() {
    return sanitizeProgress(this.#rewards.getSave(this.#slug).extra?.progress, this.#validCodes);
  }

  /** @param {import('../logic/progress.js').Progress} progress */
  save(progress) {
    this.#rewards.update(this.#slug, (save) => { save.extra = { ...save.extra, progress }; });
  }
}
