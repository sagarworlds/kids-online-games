import { gameKey, saveSchema } from '../services/schemas.js';

/** Where the choice lives inside a game's save data (`extra` is the free-form bag every game has). */
const FIELD = 'viewMode';

/**
 * The child's saved choice between the 3D and 2D version of one game.
 * Stored inside that game's own save data, so "Reset all progress" clears it with everything else
 * and no new storage key is needed.
 * @param {import('../services/StorageService.js').StorageService} storage
 * @param {string} slug
 * @returns {'3d'|'2d'|null} Null when the child has never chosen.
 */
export function readViewPreference(storage, slug) {
  const value = storage.read(gameKey(slug), saveSchema).extra[FIELD];
  return value === '3d' || value === '2d' ? value : null;
}

/**
 * Saves the choice. Other fields of the save data are kept as they are.
 * @param {import('../services/StorageService.js').StorageService} storage
 * @param {string} slug
 * @param {'3d'|'2d'} mode
 */
export function saveViewPreference(storage, slug, mode) {
  if (mode !== '3d' && mode !== '2d') return;
  const save = storage.read(gameKey(slug), saveSchema);
  storage.write(gameKey(slug), { ...save, extra: { ...save.extra, [FIELD]: mode } });
}
