/**
 * Movement maths for the 3D scenes: easing, a smooth camera, and the arc the rocket flies between two bodies.
 * Pure functions of time and points; the scenes decide when to call them (so nothing here keeps a clock).
 *
 * @typedef {import('./space3d.js').Point} Point
 */

const clamp01 = (t) => Math.min(1, Math.max(0, t));

/**
 * Slow start, slow stop. Used for the rocket's flight and for sliding a planet into its orbit.
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
 * The shortest turn from one angle to another, so a camera swinging to a new view goes the short way round (never 350
 * degrees the long way).
 * @param {number} from Radians, any size.
 * @param {number} to Radians, any size.
 * @returns {number} Radians from -PI to PI; add it to `from` to arrive at `to`.
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

/**
 * How long a hop takes: longer for farther places, but never so short it is a blink or so long a child waits.
 * @param {Point} from
 * @param {Point} to
 * @returns {number} Seconds, 0.7 to 2.
 */
export const flightSeconds = (from, to) => Math.min(2, Math.max(0.7, 0.55 + distanceBetween(from, to) * 0.06));

/**
 * How high the middle of the flight rises above the straight line, so the rocket arcs over the Sun's plane.
 * @param {Point} from
 * @param {Point} to
 * @returns {number}
 */
export const arcLift = (from, to) => Math.max(1.2, distanceBetween(from, to) * 0.22);

/**
 * Where the rocket is at a moment in its flight: the straight line from start to end, eased, plus a bump upwards that
 * is highest in the middle and zero at both ends. The end point is passed in every frame (not fixed) so the rocket
 * lands on the body even if it has changed size on the way.
 *
 * @param {Point} from
 * @param {Point} to
 * @param {number} t Progress from 0 to 1.
 * @param {number} lift The height of the bump, from `arcLift`.
 * @returns {Point}
 */
export function hopArc(from, to, t, lift) {
  const progress = clamp01(t);
  const point = lerpPoint(from, to, easeInOut(progress));
  // sin(PI) is 1.2e-16, not 0: left alone, the rocket would end a hair above the ground and never be "exactly there".
  const bump = progress === 0 || progress === 1 ? 0 : Math.sin(Math.PI * progress);
  return { ...point, y: point.y + lift * bump };
}
