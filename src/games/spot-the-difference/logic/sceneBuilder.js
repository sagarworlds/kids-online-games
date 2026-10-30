import { GameError } from '../../../engine/utils/errors.js';
import { sample } from '../../../engine/utils/random.js';
import { randomColor } from './color.js';
import { objectBox } from './geometry.js';
import { findFreeSpot } from './placement.js';

/** Objects are drawn at 85% to 110% of their template, and never taller or wider than this. */
export const MIN_SCALE = 0.85;
export const MAX_SCALE = 1.1;
export const MAX_OBJECT_SIZE = 112;
export const PLACEMENT_ATTEMPTS = 300;

/**
 * Makes a new object from a template, at a random size, tilt and colour, not yet placed.
 * @param {string} id
 * @param {{ id: string, w: number, h: number }} template
 * @param {() => number} rng
 * @returns {import('./geometry.js').SceneObject}
 */
export function newObject(id, template, rng) {
  const scale = Math.min(MIN_SCALE + rng() * (MAX_SCALE - MIN_SCALE), MAX_OBJECT_SIZE / Math.max(template.w, template.h));
  return { id, template: template.id, x: 0, y: 0, scale: Math.floor(scale * 100) / 100, color: randomColor(rng), flip: false, rotation: Math.round(rng() * 16 - 8) };
}

/**
 * Builds the left picture: `count` different objects from the theme's pool, placed so that none touch.
 * The biggest are placed first, which is when there is the most room, so a crowded picture still works.
 *
 * @param {{
 *   theme: import('./templates.js').Theme, templates: ReadonlyMap<string, import('./templates.js').Template>,
 *   count: number, rng: () => number, bounds: { w: number, h: number }
 * }} options
 * @returns {import('./geometry.js').SceneObject[]} In the order they were made (o1, o2, ...).
 * @throws {GameError} 'SCENE_CROWDED' if an object cannot be placed (the caller tries a new seed); 'BAD_SCENE' if the pool is too small.
 */
export function buildScene({ theme, templates, count, rng, bounds }) {
  if (count > theme.objects.length) throw new GameError('BAD_SCENE', `Theme "${theme.id}" has ${theme.objects.length} objects but ${count} are needed`, { theme: theme.id, count });
  const objects = sample(rng, theme.objects, count).map((templateId, i) => newObject(`o${i + 1}`, templates.get(templateId), rng));
  const bySize = [...objects].sort((a, b) => {
    const area = (o) => { const box = objectBox(o, templates.get(o.template)); return box.w * box.h; };
    return area(b) - area(a);
  });
  const placed = [];
  const positions = new Map();
  for (const object of bySize) {
    const spot = findFreeSpot(object, placed, templates, bounds, rng, PLACEMENT_ATTEMPTS);
    if (!spot) throw new GameError('SCENE_CROWDED', `Could not place the ${object.template} among ${placed.length} objects`, { theme: theme.id, template: object.template, placed: placed.length });
    placed.push(spot);
    positions.set(spot.id, spot);
  }
  return objects.map((o) => positions.get(o.id));
}
