import { KEY_PREFIX, PROFILE_KEY } from '../engine/services/schemas.js';

/**
 * Clears saved progress: every `kidsgames:*` key and nothing else. Other data
 * on the same site (other apps, browser settings) is never touched.
 * The profile name survives unless the grown-up asks to reset it too.
 *
 * @param {{
 *   storage: import('../engine/services/StorageService.js').StorageService,
 *   alsoResetName?: boolean
 * }} options
 * @returns {string[]} The keys that were removed.
 */
export function resetAllProgress({ storage, alsoResetName = false }) {
  const removed = [];
  for (const key of storage.keys(KEY_PREFIX)) {
    if (key === PROFILE_KEY && !alsoResetName) continue;
    storage.remove(key);
    removed.push(key);
  }
  return removed;
}
