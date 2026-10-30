import { objectBox, boxesOverlap, boxInBounds } from './geometry.js';

/** Things keep this far apart (in scene units), so no two objects touch and every difference stands on its own. */
export const GAP = 12;
/** Nothing is placed closer than this to the edge of the picture. */
export const MARGIN = 14;

/**
 * Does an object fit: inside the picture, and clear of every other object?
 * @param {import('./geometry.js').SceneObject} object
 * @param {readonly import('./geometry.js').SceneObject[]} others
 * @param {ReadonlyMap<string, { w: number, h: number }>} templates
 * @param {{ w: number, h: number }} bounds
 * @returns {boolean}
 */
export function fits(object, others, templates, bounds) {
  const box = objectBox(object, templates.get(object.template));
  if (!boxInBounds(box, bounds, MARGIN)) return false;
  return others.every((other) => other.id === object.id || !boxesOverlap(box, objectBox(other, templates.get(other.template)), GAP));
}

/**
 * Looks for a free spot for an object by trying random places (rejection sampling), with a limit so it can never loop
 * for ever.
 *
 * @param {import('./geometry.js').SceneObject} object Its x and y are replaced.
 * @param {readonly import('./geometry.js').SceneObject[]} others
 * @param {ReadonlyMap<string, { w: number, h: number }>} templates
 * @param {{ w: number, h: number }} bounds
 * @param {() => number} rng
 * @param {number} attempts
 * @returns {import('./geometry.js').SceneObject|null} The object at a free spot, or null if none was found.
 */
export function findFreeSpot(object, others, templates, bounds, rng, attempts) {
  const box = objectBox(object, templates.get(object.template));
  const spanX = bounds.w - 2 * MARGIN - box.w;
  const spanY = bounds.h - 2 * MARGIN - box.h;
  if (spanX < 0 || spanY < 0) return null;
  for (let i = 0; i < attempts; i++) {
    const candidate = { ...object, x: MARGIN + box.w / 2 + rng() * spanX, y: MARGIN + box.h / 2 + rng() * spanY };
    if (fits(candidate, others, templates, bounds)) return candidate;
  }
  return null;
}
