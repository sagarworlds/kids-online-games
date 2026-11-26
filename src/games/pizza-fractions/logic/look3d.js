import { GameError } from '../../../engine/utils/errors.js';

/**
 * How the 3D pizza is laid out and how it moves: pure numbers, so the way it is cut and the way it reacts can be tested without a screen.
 * The 3D pizza is built in a frame where every slice points "forwards" (towards -z) and is then turned into place, so one shared shape
 * serves every slice. The slices run clockwise from 12 o'clock, as seen from above, exactly as in the flat pizza and in `sliceAtPoint`.
 */

/** The pizza's outer radius, and the radius of the cheese (a little less, so the crust stands round the edge). */
export const PIZZA_RADIUS = 3.2;
export const CHEESE_RADIUS = 2.9;

const TWO_PI = Math.PI * 2;

const assertCount = (count) => {
  if (!Number.isInteger(count) || count < 2) throw new GameError('BAD_SLICE_COUNT', `A pizza is cut into at least 2 slices, not ${count}`, { count });
};

/**
 * The angle one slice takes up.
 * @param {number} count Slices on the pizza.
 * @returns {number} Radians.
 * @throws {GameError} 'BAD_SLICE_COUNT'
 */
export function sliceAngle(count) {
  assertCount(count);
  return TWO_PI / count;
}

/**
 * The turn about the vertical axis that takes a slice built pointing forwards (towards -z, which is 12 o'clock) to its own place. Slice 0
 * sits just clockwise of 12 o'clock and they go round clockwise seen from above (a turn about y by a positive angle goes the other way, hence
 * the minus).
 * @param {number} index
 * @param {number} count
 * @returns {number} Radians.
 */
export function sliceTurn(index, count) {
  assertCount(count);
  return -TWO_PI * ((index + 0.5) / count);
}

/**
 * Where a piece of topping sits in a slice's own frame (the slice points towards -z and is centred on that line).
 * @param {{ distance: number, across: number }} spot From `toppingSpots`.
 * @param {number} count
 * @param {number} radius What the spot's distance is a share of.
 * @returns {{ x: number, z: number }}
 */
export function spotPosition({ distance, across }, count, radius) {
  const angle = (across - 0.5) * sliceAngle(count);
  const r = distance * radius;
  return { x: r * Math.sin(angle), z: -r * Math.cos(angle) };
}

/** How high a slice with a topping stands above a bare one, and how far its outer edge tips up (radians), so the topped slices read as "chosen". */
const TOPPED_RISE = 0.34;
const TOPPED_TILT = 0.1;
/** A slice that is flagged ("check this one") also bobs by up to this much, so it is not only a colour that marks it. */
const BOB = 0.16;
const BOB_SPEED = 7;

/**
 * How far a slice is lifted.
 * @param {{ topped: boolean, flagged: boolean, clock?: number, still?: boolean }} state `clock` is seconds; with `still` (a child who asked for
 *   less motion) a flagged slice stands at the top of its bob instead of moving.
 * @returns {{ rise: number, tilt: number }}
 */
export function sliceLift({ topped, flagged, clock = 0, still = false }) {
  if (!topped && !flagged) return { rise: 0, tilt: 0 };
  const bob = flagged ? BOB * (still ? 1 : 0.5 + 0.5 * Math.sin(clock * BOB_SPEED)) : 0;
  return { rise: TOPPED_RISE + bob, tilt: TOPPED_TILT + bob * 0.4 };
}

/**
 * The little red dashes round the edge of a flagged slice (the 3D version of the flat pizza's dashed red edge), as angles from the slice's
 * middle. Thin slices get fewer.
 * @param {number} count
 * @returns {number[]} Radians, from the slice's middle, clockwise positive.
 */
export function flagDashAngles(count) {
  const per = count <= 4 ? 5 : count <= 8 ? 4 : 3;
  const span = sliceAngle(count) * 0.7;
  return Array.from({ length: per }, (_, k) => (per === 1 ? 0 : (k / (per - 1) - 0.5) * span));
}

/**
 * The first view of the pizza: from the front and above, far enough back that the whole pizza and its lifted slices fit. The camera looks at a
 * point a little in front of the pizza, so the pizza sits above the middle of the picture and leaves a strip along the bottom for the toppings.
 * @returns {{ azimuth: number, polar: number, distance: number, target: { x: number, y: number, z: number } }}
 */
export const startView = () => ({ azimuth: 0, polar: 0.95, distance: 12.5, target: { x: 0, y: 0.2, z: 1.1 } });
