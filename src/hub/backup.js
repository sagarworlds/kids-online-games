import { GameError } from '../engine/utils/errors.js';
import {
  DEVICE_KEY, KEY_PREFIX, LAST_PLAYED_KEY, PROFILE_KEY, SETTINGS_KEY,
  gameKey, lastPlayedSchema, profileSchema, saveSchema, settingsSchema,
} from '../engine/services/schemas.js';

/** @typedef {import('./gamesRegistry.js').GameEntry} GameEntry */
/** @typedef {import('../engine/services/schemas.js').Schema} Schema */

/**
 * What a grown-up can keep on a file: the child's progress, so that a new tablet, another browser or cleared site data does not lose it.
 *
 * A copy is one JSON file, `{ app, format, savedAt, entries }`, where `entries` holds the values of the keys below. Reading a copy back is
 * strict: every entry has to be one this version knows and has to pass the same checks the storage service makes, and nothing is written
 * until all of them have passed, so a damaged or tampered file can never half-apply.
 */

export const BACKUP_APP = 'kids-learning-games';
export const BACKUP_FORMAT = 1;
/** A full set of saves is a few tens of kilobytes; a file past this is not one of ours, and is not read. */
export const MAX_BACKUP_BYTES = 512 * 1024;

/** A game's key: the prefix and a lowercase word. Another one of these than the registry knows is a game from a newer version. */
const GAME_KEY = /^kidsgames:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The keys a copy may hold and what each must look like: the profile, the settings, the game played last and one save per game. The device
 * record is left out on purpose: it says how fast this tablet is, not what the child has done.
 *
 * @param {readonly GameEntry[]} games
 * @returns {Map<string, Schema>}
 */
export function backupSchemas(games) {
  const schemas = new Map([[PROFILE_KEY, profileSchema], [SETTINGS_KEY, settingsSchema], [LAST_PLAYED_KEY, lastPlayedSchema]]);
  for (const game of games) schemas.set(gameKey(game.slug), saveSchema);
  return schemas;
}

/**
 * Takes a copy of what is stored now. Only keys that are stored are copied (a game never played has no entry, rather than an empty one).
 *
 * @param {{ storage: import('../engine/services/StorageService.js').StorageService, games: readonly GameEntry[], now?: () => Date }} deps
 * @returns {{ app: string, format: number, savedAt: string, entries: Record<string, object> }}
 */
export function createBackup({ storage, games, now = () => new Date() }) {
  const schemas = backupSchemas(games);
  /** @type {Record<string, object>} */
  const entries = {};
  for (const key of storage.keys(KEY_PREFIX).sort()) {
    const schema = schemas.get(key);
    if (schema) entries[key] = storage.read(key, schema);
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, savedAt: now().toISOString(), entries };
}

/** @param {ReturnType<typeof createBackup>} backup @returns {string} The file's text, indented so a person can read it. */
export const serializeBackup = (backup) => JSON.stringify(backup, null, 2);

/** @param {string} savedAt An ISO date. @returns {string} The file's name, such as "kids-games-progress-2026-11-26.json". */
export const backupFilename = (savedAt) => `kids-games-progress-${savedAt.slice(0, 10)}.json`;

/**
 * Checks one entry as the storage service would: at the schema's version, over the defaults, and passing the schema's own check.
 * @returns {object} The entry with the defaults filled in, which is what gets written.
 * @throws {GameError} 'BACKUP_NEWER' for an entry from a newer version; 'BACKUP_BAD_ENTRY' for anything else wrong with it.
 */
function checkedEntry(key, schema, value) {
  if (!isObject(value)) throw new GameError('BACKUP_BAD_ENTRY', `"${key}" is not an object`, { key });
  if (Number.isInteger(value.version) && value.version > schema.version) {
    throw new GameError('BACKUP_NEWER', `"${key}" was saved by a newer version (v${value.version}, this one reads v${schema.version})`, { key });
  }
  if (value.version !== schema.version) throw new GameError('BACKUP_BAD_ENTRY', `"${key}" has version ${JSON.stringify(value.version)}, expected ${schema.version}`, { key });
  const merged = { ...schema.defaults(), ...value };
  if (schema.validate && !schema.validate(merged)) throw new GameError('BACKUP_BAD_ENTRY', `"${key}" failed its checks`, { key });
  return merged;
}

/**
 * Reads a copy from a file's text, checking everything before anything is used.
 *
 * Entries for a game this version does not list are skipped and named in `skipped` (a copy from a newer version, or a page that was cached
 * before a game was added); entries under any other key are refused, because nothing but the keys above is ever written.
 *
 * @param {string} text
 * @param {readonly GameEntry[]} games
 * @returns {{ backup: ReturnType<typeof createBackup>, skipped: string[] }}
 * @throws {GameError} 'BACKUP_TOO_BIG', 'BACKUP_NOT_JSON', 'BACKUP_NOT_OURS', 'BACKUP_NEWER', 'BACKUP_UNKNOWN_KEY' or 'BACKUP_BAD_ENTRY'.
 */
export function parseBackup(text, games) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text).length : Number.POSITIVE_INFINITY;
  if (bytes > MAX_BACKUP_BYTES) throw new GameError('BACKUP_TOO_BIG', `a copy is at most ${MAX_BACKUP_BYTES} bytes (this is ${bytes})`, { bytes });

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new GameError('BACKUP_NOT_JSON', 'the file is not JSON', { cause: String(error) });
  }
  if (!isObject(data) || data.app !== BACKUP_APP || !Number.isInteger(data.format) || data.format < 1 || !isObject(data.entries)) {
    throw new GameError('BACKUP_NOT_OURS', 'the file is not a copy made by this site', { app: isObject(data) ? data.app : typeof data });
  }
  if (data.format > BACKUP_FORMAT) throw new GameError('BACKUP_NEWER', `the copy is format ${data.format}; this version reads format ${BACKUP_FORMAT}`, { format: data.format });

  const schemas = backupSchemas(games);
  /** @type {Record<string, object>} */
  const entries = {};
  const skipped = [];
  for (const [key, value] of Object.entries(data.entries)) {
    const schema = schemas.get(key);
    if (schema) {
      entries[key] = checkedEntry(key, schema, value);
    } else if (GAME_KEY.test(key) && key !== DEVICE_KEY) {
      skipped.push(key);
    } else {
      throw new GameError('BACKUP_UNKNOWN_KEY', `"${key}" is not something a copy holds`, { key });
    }
  }
  const savedAt = typeof data.savedAt === 'string' && !Number.isNaN(Date.parse(data.savedAt)) ? data.savedAt : null;
  return { backup: { app: BACKUP_APP, format: data.format, savedAt, entries }, skipped };
}

/**
 * Makes this device's progress what the copy says. Whatever else is stored under the prefix goes (a game the copy has no save for was not
 * played there), except the device record, and the name when the copy has none: the child keeps theirs.
 *
 * @param {{ storage: import('../engine/services/StorageService.js').StorageService, backup: ReturnType<typeof parseBackup>['backup'] }} deps
 * @returns {{ written: string[], removed: string[], durable: boolean }} `durable` is false when the browser would not keep what was written
 *   (it is kept for this visit only).
 */
export function restoreBackup({ storage, backup }) {
  const keep = new Set([DEVICE_KEY]);
  if (!Object.hasOwn(backup.entries, PROFILE_KEY)) keep.add(PROFILE_KEY);
  const removed = [];
  for (const key of storage.keys(KEY_PREFIX)) {
    if (keep.has(key) || Object.hasOwn(backup.entries, key)) continue;
    storage.remove(key);
    removed.push(key);
  }
  const written = [];
  let durable = true;
  for (const [key, value] of Object.entries(backup.entries)) {
    durable = storage.write(key, value) && durable;
    written.push(key);
  }
  return { written, removed, durable };
}

/**
 * What to tell a grown-up who picked a file that could not be used. Nothing was changed in any of these cases.
 * @param {unknown} error What `parseBackup` threw.
 * @returns {string}
 */
export function describeBackupProblem(error) {
  switch (error instanceof GameError ? error.code : null) {
    case 'BACKUP_TOO_BIG': return 'That file is too big to be a copy of this progress. Nothing was changed.';
    case 'BACKUP_NOT_JSON':
    case 'BACKUP_NOT_OURS': return 'That file is not a copy of this progress. Pick the file this page saved. Nothing was changed.';
    case 'BACKUP_NEWER': return 'That copy was made by a newer version of this site. Reload this page while online to update it, then try again. Nothing was changed.';
    case 'BACKUP_UNKNOWN_KEY':
    case 'BACKUP_BAD_ENTRY': return 'That copy looks damaged or has been changed, so none of it was used. Nothing was changed.';
    default: return 'That file could not be read. Nothing was changed.';
  }
}
