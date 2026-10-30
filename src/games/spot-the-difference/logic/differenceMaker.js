import { GameError } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { boxesOverlap } from './geometry.js';
import { hitArea, MIN_TAP_PX } from './hitTest.js';
import { MUTATIONS } from './mutations/index.js';

/** How many times the whole set of differences is tried again (with new random choices) before giving up. */
const MAX_ATTEMPTS = 30;
/** A difference that is placed at random (an added thing) gets this many tries, since a spot is often taken by another difference. */
const SCENE_TRIES = 8;

/**
 * @typedef {{
 *   objectId: string, type: string, mutation: string, box: import('./geometry.js').Box, label: string
 * }} Difference
 * `box` is where to look (for moved and turned things, both the old and the new place); `label` is what is said when found.
 */

/**
 * Makes the right-hand picture: a copy of the left one with exactly `count` differences.
 *
 * To keep it varied the kinds of difference are used in turn, so a picture never has five colour changes and nothing else.
 * Each object takes part in at most one difference, and the places to tap are kept apart, so every difference is its own
 * clear target.
 *
 * @param {{
 *   left: readonly import('./geometry.js').SceneObject[],
 *   templates: ReadonlyMap<string, import('./templates.js').Template>,
 *   theme: import('./templates.js').Theme, mutations: readonly string[], count: number,
 *   rng: () => number, bounds: { w: number, h: number }
 * }} options
 * @returns {{ right: import('./geometry.js').SceneObject[], differences: Difference[] }}
 * @throws {GameError} 'DIFFERENCES_FAILED' if `count` clear differences cannot be made (the caller tries a new picture).
 */
export function makeDifferences({ left, templates, theme, mutations, count, rng, bounds }) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryOnce({ left, templates, theme, mutations, count, rng, bounds });
    if (result) return result;
  }
  throw new GameError('DIFFERENCES_FAILED', `Could not make ${count} differences in a "${theme.id}" picture`, { theme: theme.id, count, mutations: [...mutations] });
}

function tryOnce({ left, templates, theme, mutations, count, rng, bounds }) {
  let right = left.map((o) => ({ ...o }));
  const usedTemplates = new Set(left.map((o) => o.template));
  const touched = new Set();
  const differences = [];
  let nextNumber = left.length;
  const nextId = () => `o${++nextNumber}`;
  const order = shuffle(rng, mutations);

  for (let slot = 0; slot < count; slot++) {
    // The kind for this slot comes first; the others are only used if it cannot be done.
    const tryOrder = [order[slot % order.length], ...shuffle(rng, order.filter((_, i) => i !== slot % order.length))];
    let made = null;
    for (const id of tryOrder) {
      made = attemptMutation(MUTATIONS[id], { right, touched, differences, templates, theme, usedTemplates, rng, bounds, nextId });
      if (made) break;
    }
    if (!made) return null;
    right = made.right;
    touched.add(made.difference.objectId);
    if (made.difference.mutation === 'add') usedTemplates.add(made.template);
    differences.push(made.difference);
  }
  return { right, differences };
}

/** Tries one kind of difference on the objects in a random order. @returns {{ right: object[], difference: Difference, template: string }|null} */
function attemptMutation(mutation, state) {
  const { right, touched, differences, templates, rng, bounds } = state;
  const base = { rng, templates, theme: state.theme, usedTemplates: state.usedTemplates, bounds, nextId: state.nextId };
  const targets = mutation.targetKind === 'scene' ? new Array(SCENE_TRIES).fill(null) : shuffle(rng, right.filter((o) => !touched.has(o.id)));
  for (const target of targets) {
    const context = { ...base, others: right.filter((o) => o !== target) };
    if (!mutation.canApply(target, context)) continue;
    const result = mutation.apply(target, context);
    if (!result || !clearOfOthers(result.box, differences)) continue;
    const objectId = target ? target.id : result.add.id;
    const next = result.add
      ? [...right, result.add]
      : right.flatMap((o) => (o !== target ? [o] : result.replace ? [result.replace] : []));
    return {
      right: next,
      template: (result.add ?? target).template,
      difference: { objectId, type: mutation.type, mutation: mutation.id, box: result.box, label: result.label },
    };
  }
  return null;
}

/** Is the tap area of a new difference apart from all the ones already made? */
function clearOfOthers(box, differences) {
  const area = hitArea(box, MIN_TAP_PX);
  return differences.every((d) => !boxesOverlap(area, hitArea(d.box, MIN_TAP_PX)));
}
