import { GameError } from '../utils/errors.js';
import { LEVELS, SETTINGS_KEY, settingsSchema } from './schemas.js';

/** @typedef {import('./schemas.js').Settings} Settings */

/**
 * Global parent settings (sound, read-aloud, difficulty lock) shared by every
 * game. Other services read from here, so changing a setting takes effect
 * everywhere without each game wiring it up.
 */
export class SettingsService {
  #storage;
  #current;
  #listeners = new Set();

  /** @param {{ storage: import('./StorageService.js').StorageService }} deps */
  constructor({ storage }) {
    this.#storage = storage;
    this.#current = storage.read(SETTINGS_KEY, settingsSchema);
  }

  /** @returns {Settings} A copy, so callers cannot mutate shared state. */
  get() {
    return { ...this.#current };
  }

  /** @returns {boolean} */
  get sound() {
    return this.#current.sound;
  }

  /** @returns {boolean} */
  get readAloud() {
    return this.#current.readAloud;
  }

  /** @returns {'easy'|'medium'|'hard'|null} */
  get difficultyLock() {
    return this.#current.difficultyLock;
  }

  /**
   * Updates one or more settings, saves, and notifies listeners.
   * @param {Partial<Omit<Settings, 'version'>>} patch
   * @returns {Settings}
   * @throws {GameError} With code 'INVALID_SETTING' for an unknown key or bad value.
   */
  set(patch) {
    const next = { ...this.#current, ...patch };
    if (typeof next.sound !== 'boolean' || typeof next.readAloud !== 'boolean') {
      throw new GameError('INVALID_SETTING', 'sound and readAloud must be booleans', { patch });
    }
    if (next.difficultyLock !== null && !LEVELS.includes(next.difficultyLock)) {
      throw new GameError('INVALID_SETTING', `difficultyLock must be null or one of ${LEVELS.join(', ')}`, { patch });
    }
    this.#current = next;
    this.#storage.write(SETTINGS_KEY, next);
    this.#emit();
    return this.get();
  }

  /** Re-reads storage, e.g. after a change made in another tab or after a reset. */
  reload() {
    this.#current = this.#storage.read(SETTINGS_KEY, settingsSchema);
    this.#emit();
  }

  /**
   * @param {(settings: Settings) => void} handler
   * @returns {() => void} Unsubscribe function.
   */
  onChange(handler) {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  #emit() {
    const snapshot = this.get();
    for (const handler of this.#listeners) handler(snapshot);
  }
}
