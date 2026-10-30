/**
 * Pure maths behind drag and drop, kept apart from the DOM so it can be unit-tested.
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Box
 */

/** A press must move this many pixels before it counts as a drag (below that it is a tap). */
export const DRAG_THRESHOLD = 8;

/**
 * Has the pointer moved far enough from where it went down to be a drag, not a wobbly tap?
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function exceedsThreshold(from, to, threshold = DRAG_THRESHOLD) {
  return Math.hypot(to.x - from.x, to.y - from.y) >= threshold;
}

/**
 * Which drop zone is under the pointer? When zones overlap (a small slot inside a big tray) the innermost one, the
 * one with the smallest area, wins, because that is what the child is pointing at. A point exactly on an edge counts
 * as inside.
 *
 * @template {Box} B
 * @param {readonly B[]} zones
 * @param {number} x
 * @param {number} y
 * @returns {B|null}
 */
export function zoneAtPoint(zones, x, y) {
  let best = null;
  let bestArea = Infinity;
  for (const zone of zones) {
    if (x < zone.left || x > zone.right || y < zone.top || y > zone.bottom) continue;
    const area = (zone.right - zone.left) * (zone.bottom - zone.top);
    if (area < bestArea) {
      best = zone;
      bestArea = area;
    }
  }
  return best;
}
