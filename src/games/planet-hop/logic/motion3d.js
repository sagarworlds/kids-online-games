/**
 * The rocket's flight between two bodies. The general movement maths (easing, a smooth camera, points in space) is in
 * `src/engine/three/motionMath.js`, shared by every 3D version; only what is particular to the rocket is here.
 * Pure functions of time and points; the scene decides when to call them (so nothing here keeps a clock).
 *
 * @typedef {import('../../../engine/three/motionMath.js').Point} Point
 */
import { easeInOut, lerpPoint, distanceBetween } from '../../../engine/three/motionMath.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));

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
