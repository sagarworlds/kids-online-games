import { GameError } from '../utils/errors.js';

/** @typedef {import('./schemas.js').Schema} Schema */

/** Shown to the player when progress cannot be saved. */
export const STORAGE_NOTICE = "Progress won't be saved on this device";

const PROBE_KEY = 'kidsgames:__probe__';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A Storage-shaped object that lives only in memory.
 * @returns {Pick<Storage, 'getItem'|'setItem'|'removeItem'|'key'> & { readonly length: number }}
 */
export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

/**
 * Returns `localStorage` if it works, otherwise null. Merely touching
 * `window.localStorage` can throw (blocked cookies, some private modes), and
 * Safari private mode used to throw only on the first write, so we probe it.
 * @param {typeof globalThis} [scope]
 * @returns {Storage|null}
 */
export function detectLocalStorage(scope = globalThis) {
  try {
    const store = scope.localStorage;
    if (!store) return null;
    store.setItem(PROBE_KEY, '1');
    store.removeItem(PROBE_KEY);
    return store;
  } catch {
    return null;
  }
}

/**
 * localStorage wrapper that never throws at the caller and never loses the session.
 *
 * - Values are JSON with a `version`; older versions are migrated on read.
 * - Corrupt JSON in one key resets only that key.
 * - If storage is missing, blocked or full, everything keeps working from an
 *   in-memory store and a one-time notice is raised ("Progress won't be saved").
 *
 * Games and the hub use this class only; they never touch `localStorage`.
 */
export class StorageService {
  #primary;
  #memory = createMemoryBackend();
  #persistent;
  #logger;
  #eventTarget;
  #notice = null;
  #noticeHandlers = new Set();

  /**
   * @param {{
   *   backend?: Storage|null, logger?: Pick<Console, 'error'|'warn'>,
   *   eventTarget?: EventTarget|null
   * }} [options] Pass `backend: null` to force the in-memory fallback.
   */
  constructor({ backend = detectLocalStorage(), logger = console, eventTarget = globalThis.window ?? null } = {}) {
    this.#primary = backend;
    this.#persistent = backend !== null;
    this.#logger = logger;
    this.#eventTarget = eventTarget;
    if (!this.#persistent) this.#notice = STORAGE_NOTICE;
  }

  /** @returns {boolean} False once data is being kept in memory only. */
  get isPersistent() {
    return this.#persistent;
  }

  /** @returns {string|null} The "not saved" notice, or null while saving works. */
  get notice() {
    return this.#notice;
  }

  /**
   * Subscribes to the "progress won't be saved" notice (fires once, when storage degrades).
   * @param {(message: string) => void} handler
   * @returns {() => void} Unsubscribe function.
   */
  onNotice(handler) {
    this.#noticeHandlers.add(handler);
    return () => this.#noticeHandlers.delete(handler);
  }

  /**
   * Subscribes to writes made by *other* tabs (the browser `storage` event).
   * @param {(key: string|null) => void} handler Receives the changed key (null = cleared).
   * @returns {() => void} Unsubscribe function.
   */
  onExternalChange(handler) {
    if (!this.#eventTarget) return () => {};
    const listener = (event) => handler(event.key);
    this.#eventTarget.addEventListener('storage', listener);
    return () => this.#eventTarget.removeEventListener('storage', listener);
  }

  /**
   * Reads and, if needed, migrates a value.
   * @param {string} key
   * @param {Schema} schema
   * @returns {object} Always a usable object: stored data merged over defaults.
   */
  read(key, schema) {
    const raw = this.#getRaw(key);
    if (raw === null) return schema.defaults();

    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      return this.#reset(key, schema, 'is not valid JSON', error);
    }
    if (!isObject(data)) return this.#reset(key, schema, 'is not an object');

    let version = Number.isInteger(data.version) ? data.version : 0;
    const startedAt = version;
    while (version < schema.version) {
      const step = schema.migrations?.[version];
      if (step) {
        data = step(data);
      } else {
        // No migration written for this hop: keep the data, stamp the new version.
        this.#logger.warn(`[storage] no migration for "${key}" v${version}; keeping data as-is`);
      }
      version += 1;
      data = { ...data, version };
    }

    const merged = { ...schema.defaults(), ...data };
    if (schema.validate && !schema.validate(merged)) {
      return this.#reset(key, schema, 'failed validation');
    }
    if (version !== startedAt) this.write(key, merged);
    return merged;
  }

  /**
   * Saves a JSON-serialisable value.
   * @param {string} key
   * @param {object} value
   * @returns {boolean} True if stored durably, false if only kept in memory.
   * @throws {GameError} With code 'STORAGE_SERIALIZE' if the value cannot be turned into JSON.
   */
  write(key, value) {
    let raw;
    try {
      raw = JSON.stringify(value);
    } catch (error) {
      throw new GameError('STORAGE_SERIALIZE', `Cannot serialise value for "${key}"`, { key, cause: String(error) });
    }
    if (this.#persistent) {
      try {
        this.#primary.setItem(key, raw);
        this.#memory.removeItem(key);
        return true;
      } catch (error) {
        // Typically QuotaExceededError or a SecurityError in private mode.
        this.#degrade(error);
      }
    }
    this.#memory.setItem(key, raw);
    return false;
  }

  /** Removes a key everywhere. @param {string} key */
  remove(key) {
    this.#memory.removeItem(key);
    if (!this.#primary) return;
    try {
      this.#primary.removeItem(key);
    } catch (error) {
      this.#degrade(error);
    }
  }

  /**
   * Lists stored keys that start with a prefix.
   * @param {string} [prefix]
   * @returns {string[]}
   */
  keys(prefix = '') {
    const found = new Set();
    const collect = (store) => {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key !== null && key.startsWith(prefix)) found.add(key);
      }
    };
    collect(this.#memory);
    if (this.#primary) {
      try {
        collect(this.#primary);
      } catch (error) {
        this.#degrade(error);
      }
    }
    return [...found];
  }

  /**
   * Deletes every key with the prefix and nothing else.
   * @param {string} prefix Must not be empty, so a bug can never wipe unrelated site data.
   * @returns {string[]} The keys that were removed.
   * @throws {GameError} With code 'BAD_PREFIX' for an empty prefix.
   */
  clearPrefix(prefix) {
    if (!prefix) throw new GameError('BAD_PREFIX', 'clearPrefix requires a non-empty prefix');
    const doomed = this.keys(prefix);
    for (const key of doomed) this.remove(key);
    return doomed;
  }

  #getRaw(key) {
    const inMemory = this.#memory.getItem(key);
    if (inMemory !== null) return inMemory;
    if (!this.#primary) return null;
    try {
      return this.#primary.getItem(key);
    } catch (error) {
      this.#degrade(error);
      return null;
    }
  }

  #reset(key, schema, why, error) {
    // Reset only this key and carry on, as the spec requires; the name goes in the log.
    this.#logger.error(`[storage] "${key}" ${why}; resetting that key to defaults`, error ?? '');
    this.remove(key);
    return schema.defaults();
  }

  #degrade(error) {
    if (!this.#persistent) return;
    this.#persistent = false;
    this.#notice = STORAGE_NOTICE;
    this.#logger.error('[storage] localStorage is unavailable; using in-memory storage for this session', error);
    for (const handler of this.#noticeHandlers) handler(STORAGE_NOTICE);
  }
}
