import { GameError } from '../../../engine/utils/errors.js';
import { createRng } from '../../../engine/utils/random.js';
import { LEVELS, SCENE_WIDTH, SCENE_HEIGHT } from './levels.js';
import { buildScene } from './sceneBuilder.js';
import { makeDifferences } from './differenceMaker.js';

/** A puzzle that cannot be built from a seed is tried again with a nearby one, this many times in all. */
export const MAX_PUZZLE_ATTEMPTS = 3;
const RETRY_STRIDE = 7919;
/** Only these are "this seed was unlucky": anything else is a bug and must not be hidden by a retry. */
const RETRYABLE = new Set(['SCENE_CROWDED', 'DIFFERENCES_FAILED']);

/**
 * @typedef {{
 *   seed: number, themeId: string, levelId: string, bounds: { w: number, h: number },
 *   left: import('./geometry.js').SceneObject[], right: import('./geometry.js').SceneObject[],
 *   differences: import('./differenceMaker.js').Difference[]
 * }} Puzzle
 */

/**
 * Makes a puzzle: two pictures and the list of their differences. The same seed always makes the same puzzle, so a
 * puzzle can be replayed or checked in a test.
 *
 * @param {{
 *   themeId: string, levelId: string, seed: number,
 *   themes: ReadonlyMap<string, import('./templates.js').Theme>, templates: ReadonlyMap<string, import('./templates.js').Template>
 * }} options
 * @returns {Puzzle}
 * @throws {GameError} 'UNKNOWN_THEME' / 'UNKNOWN_LEVEL' for bad input; 'PUZZLE_FAILED' if no attempt worked.
 */
export function generatePuzzle({ themeId, levelId, seed, themes, templates }) {
  const theme = themes.get(themeId);
  if (!theme) throw new GameError('UNKNOWN_THEME', `There is no theme "${themeId}"`, { themeId });
  const level = LEVELS[levelId];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `There is no level "${levelId}"`, { levelId });
  const bounds = { w: SCENE_WIDTH, h: SCENE_HEIGHT };

  let lastError = null;
  for (let attempt = 0; attempt < MAX_PUZZLE_ATTEMPTS; attempt++) {
    const rng = createRng((seed + attempt * RETRY_STRIDE) >>> 0);
    try {
      const left = buildScene({ theme, templates, count: level.objects, rng, bounds });
      const { right, differences } = makeDifferences({ left, templates, theme, mutations: level.mutations, count: level.differences, rng, bounds });
      return { seed, themeId, levelId, bounds, left, right, differences };
    } catch (error) {
      if (!(error instanceof GameError) || !RETRYABLE.has(error.code)) throw error;
      lastError = error;
    }
  }
  throw new GameError('PUZZLE_FAILED', `Could not make a "${themeId}" ${levelId} puzzle from seed ${seed}: ${lastError?.message}`, { themeId, levelId, seed, cause: lastError?.code });
}

/**
 * Compares two pictures from scratch, without using how they were made, and lists what is different. The tests use this to
 * prove a puzzle has exactly the differences it says, and no others hiding in it.
 *
 * @param {readonly import('./geometry.js').SceneObject[]} left
 * @param {readonly import('./geometry.js').SceneObject[]} right
 * @returns {{ id: string, kinds: string[], moved: number, turned: number, ratio: number }[]}
 *   `kinds` has one entry for each way an object differs; `moved` is the distance (scene units), `turned` the angle
 *   (degrees, 0 to 180) and `ratio` the size ratio (bigger over smaller, 1 if the same).
 */
export function diffScenes(left, right) {
  const rightById = new Map(right.map((o) => [o.id, o]));
  const leftIds = new Set(left.map((o) => o.id));
  const found = [];
  for (const a of left) {
    const b = rightById.get(a.id);
    if (!b) {
      found.push({ id: a.id, kinds: ['remove'], moved: 0, turned: 0, ratio: 1 });
      continue;
    }
    const kinds = [];
    const moved = Math.hypot(a.x - b.x, a.y - b.y);
    const turned = Math.abs(((((b.rotation - a.rotation) % 360) + 540) % 360) - 180);
    const ratio = Math.max(a.scale, b.scale) / Math.min(a.scale, b.scale);
    if (a.color !== b.color) kinds.push('recolor');
    if (a.flip !== b.flip) kinds.push('flip');
    if (a.template !== b.template) kinds.push('swap');
    if (moved > 0.001) kinds.push('move');
    if (turned > 0.001) kinds.push('rotate');
    if (ratio > 1.001) kinds.push('resize');
    if (kinds.length) found.push({ id: a.id, kinds, moved, turned, ratio });
  }
  for (const b of right) if (!leftIds.has(b.id)) found.push({ id: b.id, kinds: ['add'], moved: 0, turned: 0, ratio: 1 });
  return found;
}
