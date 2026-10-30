/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/**
 * Restricts a value to [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Linear interpolation from a to b.
 * @param {number} a
 * @param {number} b
 * @param {number} t 0 gives a, 1 gives b.
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Euclidean distance between two points.
 * @param {Point} a
 * @param {Point} b
 * @returns {number}
 */
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * @param {Point} p
 * @param {Rect} r
 * @returns {boolean} True when the point lies inside or on the edge of the rect.
 */
export function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * @param {Point} p
 * @param {{ x: number, y: number, r: number }} circle
 * @returns {boolean}
 */
export function pointInCircle(p, circle) {
  return distance(p, circle) <= circle.r;
}

/**
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean} True when the rects overlap (touching edges do not count).
 */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * @param {{ x: number, y: number, r: number }} a
 * @param {{ x: number, y: number, r: number }} b
 * @returns {boolean} True when the circles overlap (touching does not count).
 */
export function circlesOverlap(a, b) {
  return distance(a, b) < a.r + b.r;
}
