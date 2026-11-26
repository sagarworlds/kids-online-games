import { GameError } from '../utils/errors.js';
import { LAST_PLAYED_KEY, lastPlayedSchema } from './schemas.js';

/**
 * Remembers which game the child was last playing, so the home page can offer to carry on with it. Depends on the StorageService
 * interface only. It does not know the list of games: whether a remembered slug is a real game that can be opened is for whoever reads it
 * to decide (the home page checks it against its registry).
 */
export class LastPlayedService {
  #storage;
  #now;

  /**
   * @param {{ storage: import('./StorageService.js').StorageService, now?: () => number }} deps `now` is the clock, injected so tests
   *   can control it.
   */
  constructor({ storage, now = Date.now }) {
    this.#storage = storage;
    this.#now = now;
  }

  /**
   * Notes that the child is playing a game now. The latest game replaces the one before it. Noting the game that is already the one
   * remembered writes nothing, so a game may call this on every screen change: that keeps the record right when the child goes back to a
   * game page the browser kept (it does not start again) or plays two games in two tabs, and costs a write only when the game changes.
   *
   * @param {string} slug The game's folder name, such as 'number-ninja'.
   * @returns {boolean} Whether the record changed (false when this game was already the one remembered).
   * @throws {GameError} With code 'BAD_SLUG' unless slug is a string with something in it.
   */
  record(slug) {
    if (typeof slug !== 'string' || slug === '') {
      throw new GameError('BAD_SLUG', `a game's slug is a non-empty string (got ${JSON.stringify(slug)})`, { slug });
    }
    if (this.current()?.slug === slug) return false;
    this.#storage.write(LAST_PLAYED_KEY, { version: lastPlayedSchema.version, slug, at: this.#now() });
    return true;
  }

  /**
   * @returns {{ slug: string, at: number }|null} The game played last, or null when none is remembered (a first visit, after the
   *   grown-ups reset progress, or storage that does not last from one page to the next).
   */
  current() {
    const { slug, at } = this.#storage.read(LAST_PLAYED_KEY, lastPlayedSchema);
    return slug === '' ? null : { slug, at };
  }
}
