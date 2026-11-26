/**
 * Movement maths every 3D scene needs: easing, a camera that glides, turning the short way round and points in space.
 * Pure functions of time and numbers (no three.js, no clock of their own), so each rule is unit-tested without a browser
 * and a scene decides when to call them.
 *
 * @typedef {{ x: number, y: number, z: number }} Point
 */

const clamp01 = (t) => Math.min(1, Math.max(0, t));

/**
 * Slow start, slow stop. Used for flights, slides and anything else that should not move at a constant speed.
 * @param {number} t Progress from 0 to 1 (values outside are held at the ends).
 * @returns {number} 0 to 1.
 */
export function easeInOut(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * Moves a number a fraction of the way to its goal each frame, with the same feel on every frame rate: the fraction
 * depends on `dt`, so a slow phone and a fast desktop reach the goal at the same time.
 *
 * @param {number} current
 * @param {number} goal
 * @param {number} dt Seconds since the last frame.
 * @param {number} [rate] Bigger is quicker; 6 closes about 99% of the gap in 0.8 s.
 * @returns {number} Equal to `goal` once it is closer than a thousandth, so the motion really ends.
 */
export function approach(current, goal, dt, rate = 6) {
  if (!(dt > 0)) return current;
  const next = current + (goal - current) * (1 - Math.exp(-rate * dt));
  return Math.abs(goal - next) < 1e-3 ? goal : next;
}

/**
 * The shortest turn from one angle to another, so a camera or a robot swinging to a new heading goes the short way round
 * (never 350 degrees the long way).
 * @param {number} from Radians, any size.
 * @param {number} to Radians, any size.
 * @returns {number} Radians from -PI (excluded) to PI; add it to `from` to arrive at `to`.
 */
export function shortestTurn(from, to) {
  const full = Math.PI * 2;
  const wrapped = (((to - from + Math.PI) % full) + full) % full - Math.PI;
  // A turn of exactly half a circle is the same either way round; always choose the positive one.
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** @param {Point} a @param {Point} b @returns {number} Straight-line distance. */
export const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** @param {Point} a @param {Point} b @param {number} t 0 to 1. @returns {Point} */
export const lerpPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
