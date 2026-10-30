import { boxCentre, boxContains, inflateBox } from './geometry.js';

/** A tap this close to a difference (scene units) still counts, so small differences are fair to find with a finger. */
export const HIT_PAD = 16;
/** A difference is never harder to tap than this, in screen pixels (the spec's minimum tap target). */
export const MIN_TAP_PX = 48;

/**
 * The area where a tap counts as finding a difference: its box with some room round it, and never smaller than `minSize`.
 * @param {import('./geometry.js').Box} box
 * @param {number} [minSize] Smallest width and height, in scene units. Callers pass `MIN_TAP_PX / scale`.
 * @param {number} [pad]
 * @returns {import('./geometry.js').Box}
 */
export function hitArea(box, minSize = MIN_TAP_PX, pad = HIT_PAD) {
  const padded = inflateBox(box, pad);
  const w = Math.max(padded.w, minSize);
  const h = Math.max(padded.h, minSize);
  const c = boxCentre(padded);
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

/**
 * Which difference was tapped? When two areas hold the point the one whose centre is nearest wins.
 *
 * @param {{ x: number, y: number }} point In scene units.
 * @param {readonly { box: import('./geometry.js').Box }[]} differences
 * @param {{ minSize?: number, ignore?: (index: number) => boolean }} [options] `ignore` skips differences (the found ones).
 * @returns {number} Its index, or -1 if the tap was not on a difference.
 */
export function findDifferenceAt(point, differences, { minSize = MIN_TAP_PX, ignore = () => false } = {}) {
  let best = -1;
  let bestDistance = Infinity;
  differences.forEach((difference, index) => {
    if (ignore(index)) return;
    const area = hitArea(difference.box, minSize);
    if (!boxContains(area, point)) return;
    const c = boxCentre(area);
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (d < bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}
