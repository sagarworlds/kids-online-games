import { defaultGhost, validateGhost } from './ghost.js';
import { sanitizeWeights } from './weights.js';
import { RACE_LENGTH } from './levels.js';

/**
 * Helpers for what the game keeps in `save.extra`: the best run per level and table choice (the ghost) and the fact
 * weights. They only read and build plain objects; the scene does the actual saving through the RewardService.
 *
 * @typedef {{ ghosts?: Record<string, import('./ghost.js').GhostRun>, weights?: import('./weights.js').FactWeights }} Extra
 */

/**
 * The name a table choice is saved under: "mixed" for the level's own tables, otherwise "3-7".
 * @param {readonly number[]|null|undefined} tables
 * @param {{ tables: readonly number[] }} level
 * @returns {string}
 */
export function tablesKey(tables, level) {
  if (!tables?.length) return 'mixed';
  const sorted = [...new Set(tables)].sort((a, b) => a - b);
  const all = [...level.tables].sort((a, b) => a - b);
  return sorted.length === all.length && sorted.every((t, i) => t === all[i]) ? 'mixed' : sorted.join('-');
}

/** @param {string} levelId @param {string} table @returns {string} */
export const ghostKey = (levelId, table) => `${levelId}:${table}`;

/** @param {Extra} extra @returns {import('./weights.js').FactWeights} */
export const readWeights = (extra) => sanitizeWeights(extra?.weights);

/**
 * The ghost to race: the saved best run, or the default pace if there is none or it is damaged.
 * Damage is logged (naming the key) so it is noticed, but never stops the game.
 *
 * @param {Extra} extra
 * @param {string} levelId
 * @param {string} table
 * @param {number} defaultPaceMs
 * @param {{ error: (...args: unknown[]) => void }} [logger]
 * @param {number} [length]
 * @returns {{ run: import('./ghost.js').GhostRun, isDefault: boolean }}
 */
export function loadGhost(extra, levelId, table, defaultPaceMs, logger = console, length = RACE_LENGTH) {
  const key = ghostKey(levelId, table);
  const saved = extra?.ghosts?.[key];
  if (saved !== undefined) {
    const valid = validateGhost(saved, length);
    if (valid) return { run: valid, isDefault: false };
    logger.error(`[times-table-racing] saved ghost "${key}" is damaged; using the default ghost`, saved);
  }
  return { run: defaultGhost(defaultPaceMs, table, length), isDefault: true };
}

/**
 * The new `extra` after a race: the weights are replaced, and the run becomes the saved ghost if it beat the saved
 * best (or there was none). A slower run never replaces the ghost, so the ghost only gets harder to beat.
 *
 * @param {Extra} extra
 * @param {{ levelId: string, table: string, run: import('./ghost.js').GhostRun, weights: import('./weights.js').FactWeights }} result
 * @returns {{ extra: Extra, newBest: boolean }}
 */
export function withRaceResult(extra, { levelId, table, run, weights }) {
  const key = ghostKey(levelId, table);
  const previous = validateGhost(extra?.ghosts?.[key], run.times.length);
  const finish = run.times[run.times.length - 1];
  const newBest = !previous || finish < previous.times[previous.times.length - 1];
  return {
    newBest,
    extra: {
      ...extra,
      weights,
      ghosts: { ...extra?.ghosts, ...(newBest ? { [key]: { table, times: [...run.times] } } : {}) },
    },
  };
}
