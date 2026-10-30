import { GameError } from '../engine/utils/errors.js';
import { PROFILE_KEY, profileSchema } from '../engine/services/schemas.js';
import { randomName } from './nameGenerator.js';
import { validateName } from './nameValidation.js';

/** @typedef {import('../engine/services/schemas.js').Profile} Profile */

/** Shown when a game is opened before the hub has ever created a profile. */
const GUEST = Object.freeze({ name: 'Friend', avatar: '🙂' });

/**
 * The player's name and avatar. Only an adjective-animal name is ever stored:
 * no surname, age, email or photo is asked for or kept.
 *
 * Depends on the StorageService interface, never on localStorage.
 */
export class ProfileService {
  #storage;
  #rng;
  #names;
  #blocklist;

  /**
   * @param {{
   *   storage: import('../engine/services/StorageService.js').StorageService,
   *   rng: () => number,
   *   names?: import('./nameGenerator.js').NameLists|null,
   *   blocklist?: readonly string[]
   * }} deps `names` is loaded by the hub. Game pages omit it: they only read
   *   the profile and fall back to a guest name if none exists yet.
   */
  constructor({ storage, rng, names = null, blocklist = [] }) {
    this.#storage = storage;
    this.#rng = rng;
    this.#names = names;
    this.#blocklist = blocklist;
  }

  /**
   * Returns the saved profile. On the very first visit (hub only) a random
   * name is generated and saved at once, so reloads show the same name.
   * @returns {{ name: string, avatar: string, createdAt: number }}
   */
  getProfile() {
    const saved = this.#storage.read(PROFILE_KEY, profileSchema);
    if (saved.name) return saved;
    if (!this.#names) return { ...GUEST, createdAt: 0 };
    const { name, avatar } = randomName(this.#rng, this.#names);
    return this.#save({ name, avatar, createdAt: Date.now() });
  }

  /**
   * Changes the name. The avatar stays the same unless one is passed in
   * (for example when accepting a shuffled suggestion).
   * @param {string} name What the child typed.
   * @param {string} [avatar] Optional new avatar emoji.
   * @returns {Profile}
   * @throws {GameError} Code 'INVALID_NAME' with a child-friendly message.
   */
  rename(name, avatar) {
    const clean = validateName(name, this.#blocklist);
    const current = this.getProfile();
    return this.#save({ name: clean, avatar: avatar ?? current.avatar, createdAt: current.createdAt || Date.now() });
  }

  /**
   * Suggests a different random name. It is NOT saved, so Cancel can undo it.
   * @returns {{ name: string, avatar: string }}
   * @throws {GameError} Code 'NO_NAME_DATA' if the name lists were not provided.
   */
  shuffleName() {
    if (!this.#names) throw new GameError('NO_NAME_DATA', 'shuffleName needs the name lists');
    const current = this.#storage.read(PROFILE_KEY, profileSchema).name;
    // Re-draw a few times so "Shuffle" visibly changes the name.
    let next = randomName(this.#rng, this.#names);
    for (let tries = 0; tries < 5 && next.name === current; tries++) next = randomName(this.#rng, this.#names);
    return next;
  }

  #save({ name, avatar, createdAt }) {
    const profile = { version: profileSchema.version, name, avatar, createdAt };
    this.#storage.write(PROFILE_KEY, profile);
    return profile;
  }
}
