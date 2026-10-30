/**
 * @typedef {{ shape: 'circle'|'square'|'triangle'|'star'|'arrow', color: string, rotation?: number, count?: number }} Token
 * A shape in a colour. `rotation` (degrees, clockwise) matters for arrows; `count` is how many are drawn in a group
 * (a growing pattern shows 1, 2, 3 ... stars).
 * @typedef {number|Token} Item
 */

const isToken = (x) => typeof x === 'object' && x !== null;

/**
 * Are two items the same? Numbers by value; tokens by shape, colour, rotation and count (a missing rotation is 0 and
 * a missing count is 1, so `{shape: 'star'}` and `{shape: 'star', count: 1}` are the same).
 * @param {Item} a
 * @param {Item} b
 * @returns {boolean}
 */
export function same(a, b) {
  if (!isToken(a) || !isToken(b)) return a === b;
  return a.shape === b.shape && a.color === b.color && (a.rotation ?? 0) === (b.rotation ?? 0) && (a.count ?? 1) === (b.count ?? 1);
}

/** @param {readonly Item[]} list @param {Item} item @returns {number} Index of the first equal item, or -1. */
export const indexOfItem = (list, item) => list.findIndex((x) => same(x, item));

/** @param {readonly Item[]} list @returns {boolean} True if no two items are the same. */
export const allDistinct = (list) => list.every((item, i) => indexOfItem(list, item) === i);
