/**
 * Storage keys and schemas shared by the hub and every game.
 * Keeping them in one file means a key name or shape is defined exactly once.
 */

/** Every key this project writes starts with this prefix; "Reset" clears only these. */
export const KEY_PREFIX = 'kidsgames:';
export const PROFILE_KEY = `${KEY_PREFIX}profile`;
export const SETTINGS_KEY = `${KEY_PREFIX}settings`;
export const DEVICE_KEY = `${KEY_PREFIX}device`;

/** @param {string} slug Game folder name, e.g. 'number-ninja'. @returns {string} */
export const gameKey = (slug) => `${KEY_PREFIX}${slug}`;

/** The three difficulty levels every game offers. */
export const LEVELS = Object.freeze(['easy', 'medium', 'hard']);

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * @typedef {{
 *   version: number,
 *   defaults: () => object,
 *   migrations?: Record<number, (old: object) => object>,
 *   validate?: (data: object) => boolean
 * }} Schema
 * `migrations[n]` upgrades a version-n object to version n + 1.
 * `validate` runs after migration; returning false resets the key to defaults.
 */

/** @typedef {{ version: number, name: string, avatar: string, createdAt: number }} Profile */
/** @type {Schema} */
export const profileSchema = {
  version: 1,
  defaults: () => ({ version: 1, name: '', avatar: '', createdAt: 0 }),
  validate: (d) => typeof d.name === 'string' && typeof d.avatar === 'string' && typeof d.createdAt === 'number',
};

/** @typedef {{ version: number, sound: boolean, readAloud: boolean, difficultyLock: 'easy'|'medium'|'hard'|null }} Settings */
/** @type {Schema} */
export const settingsSchema = {
  version: 1,
  defaults: () => ({ version: 1, sound: true, readAloud: false, difficultyLock: null }),
  validate: (d) =>
    typeof d.sound === 'boolean' &&
    typeof d.readAloud === 'boolean' &&
    (d.difficultyLock === null || LEVELS.includes(d.difficultyLock)),
};

/**
 * What this device has shown about itself, as opposed to what the child or a grown-up chose. `slow3d` is set when a 3D view ran too
 * slowly here, so games open flat by default from then on. `frameWatch` is a developer switch: 'off' stops the 3D views from judging
 * their own speed (the software renderer on a test machine is slow on purpose).
 * @typedef {{ version: number, slow3d: boolean, frameWatch: 'on'|'off' }} Device
 */
/** @type {Schema} */
export const deviceSchema = {
  version: 1,
  defaults: () => ({ version: 1, slow3d: false, frameWatch: 'on' }),
  validate: (d) => typeof d.slow3d === 'boolean' && (d.frameWatch === 'on' || d.frameWatch === 'off'),
};

/**
 * Per-game progress. `extra` is a free-form bag for a game's own data (for
 * example unlocked levels or fact weights) so games never need extra keys.
 * @typedef {{
 *   version: number, bestStars: Record<string, 1|2|3>, bestScore: number,
 *   badges: string[], extra: Record<string, unknown>
 * }} SaveData
 */
/** @type {Schema} */
export const saveSchema = {
  version: 1,
  defaults: () => ({ version: 1, bestStars: {}, bestScore: 0, badges: [], extra: {} }),
  validate: (d) =>
    isObject(d.bestStars) &&
    Object.values(d.bestStars).every((s) => s === 1 || s === 2 || s === 3) &&
    Number.isFinite(d.bestScore) &&
    Array.isArray(d.badges) &&
    d.badges.every((b) => typeof b === 'string') &&
    isObject(d.extra),
};
