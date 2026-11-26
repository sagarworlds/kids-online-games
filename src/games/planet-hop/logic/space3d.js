import { GameError } from '../../../engine/utils/errors.js';
import { MAX_DIAMETER } from './scale.js';
import { jumpHeight } from './gravityJump.js';

/**
 * Where everything goes in the 3D solar system, in scene units. Pure numbers only (no three.js), so the layout rules
 * are tested without a browser and the 3D scenes just place meshes at these points.
 *
 * The orbits are spaced evenly, not by true distance: Neptune is 77 times as far out as Mercury, which would push the
 * inner planets into the Sun. Sizes follow the same rule as the 2D game (a compressed scale, or true proportions
 * with "Show real size"), so the 3D view teaches the same thing as the 2D one.
 *
 * @typedef {{ x: number, y: number, z: number }} Point
 */

export const SUN_RADIUS = 1.5;
/** The radius of the innermost orbit; far enough out that Mercury never touches the Sun. */
export const FIRST_ORBIT = 3.2;
/** Space between neighbouring orbits; wider than the biggest planet's radius, so neighbours do not collide. */
export const ORBIT_GAP = 1.6;
/** The biggest body (Jupiter) is drawn with this radius; every other size is worked out from it. */
export const MAX_BODY_RADIUS = 1.35;
/** A body is at least this easy to tap, even when "real size" makes it a speck (the picture stays tiny). */
export const PICK_MIN_RADIUS = 0.8;
/** Neighbouring planets sit this far round the Sun from each other: the golden angle, which never lines two up. */
const ANGLE_STEP = 2.399963;
const ANGLE_START = 0.7;
/** Clear space between the Moon's edge and its planet's edge, so the two stay separate shapes. */
const MOON_GAP = 0.45;

/**
 * @param {number} order The planet's number from the Sun, starting at 1.
 * @returns {number} Radius of its orbit.
 * @throws {GameError} 'BAD_ORDER' unless `order` is a whole number from 1.
 */
export function orbitRadius(order) {
  if (!Number.isInteger(order) || order < 1) throw new GameError('BAD_ORDER', `an orbit number is a whole number from 1 (got ${order})`, { order });
  return FIRST_ORBIT + (order - 1) * ORBIT_GAP;
}

/**
 * Where a planet sits on its orbit (a fixed place, so the child can learn where each one is).
 * @param {number} order Starting at 1.
 * @returns {Point} In the plane of the orbits (y is up and is 0).
 * @throws {GameError} 'BAD_ORDER'.
 */
export function orbitPoint(order) {
  const radius = orbitRadius(order);
  const angle = ANGLE_START + (order - 1) * ANGLE_STEP;
  return { x: radius * Math.sin(angle), y: 0, z: radius * Math.cos(angle) };
}

/**
 * Where the Moon (or any body that orbits a planet) sits: just beside its planet, along the planet's orbit, so it
 * never hides behind it when the child looks from the Sun's side.
 * @param {Point} parent Where the planet is.
 * @param {number} parentRadius
 * @param {number} bodyRadius
 * @returns {Point}
 */
export function moonPoint(parent, parentRadius, bodyRadius) {
  const length = Math.hypot(parent.x, parent.z) || 1;
  // The direction of travel round the Sun is at right angles to the line from the Sun to the planet.
  const along = { x: parent.z / length, z: -parent.x / length };
  const gap = parentRadius + bodyRadius + MOON_GAP;
  return { x: parent.x + along.x * gap, y: parent.y, z: parent.z + along.z * gap };
}

/**
 * Turns a picture size from the 2D game (pixels, from `createSizer`) into a sphere radius in the scene.
 * @param {number} diameterPx Between MIN_DIAMETER and MAX_DIAMETER in the compressed view; smaller in "real size".
 * @returns {number}
 */
export const bodyRadius = (diameterPx) => (diameterPx / MAX_DIAMETER) * MAX_BODY_RADIUS;

/** The radius of the outermost orbit among `count` planets. @param {number} count */
export const outerRadius = (count) => orbitRadius(Math.max(1, count));

/**
 * The camera distance that shows the whole solar system, wide screens and tall phones alike.
 * The width is the tight direction on a phone held upright, so the distance is worked out from it; wide screens are
 * treated as no wider than 1.3 so the system does not shrink to a dot on a big monitor.
 *
 * @param {{ aspect: number, outer: number, fovDegrees?: number, margin?: number }} options `aspect` is width / height.
 * @returns {number}
 */
export function overviewDistance({ aspect, outer, fovDegrees = 50, margin = 2.2 }) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? Math.min(aspect, 1.3) : 1;
  const halfHeight = Math.tan((fovDegrees * Math.PI) / 360);
  return (outer + margin) / (halfHeight * safeAspect);
}

/**
 * How big the rocket and the astronaut are next to a body: full size on big bodies, smaller on the tiny ones in
 * "real size", so a figure is never a giant standing on a speck. Never below a tenth, so it can still be seen.
 * @param {number} radius The body's radius in the scene.
 * @returns {number} A scale from 0.1 to 1.
 */
export const figureScale = (radius) => Math.min(1, Math.max(0.1, radius / 0.9));

/** The height of the astronaut at full size, in scene units. */
export const FIGURE_HEIGHT = 0.7;

/**
 * Where the camera goes to watch the astronaut on a body: close enough to see it clearly, and far and high enough that the
 * whole jump fits. The Moon's jump is about six times as high as Earth's, so a camera framed on the ground alone would
 * cut the astronaut off at the top of the picture.
 *
 * @param {{ radius: number, gravity: number, fovDegrees?: number }} options `radius` is the body's radius in the scene.
 * @returns {{ distance: number, lift: number }} `lift` is how far above the body's centre the camera should aim.
 * @throws {GameError} 'BAD_GRAVITY' (from `jumpHeight`).
 */
export function focusFraming({ radius, gravity, fovDegrees = 50 }) {
  const figure = FIGURE_HEIGHT * figureScale(radius);
  // From the bottom of the body to the top of the highest jump, plus the astronaut's own height.
  const span = 2 * radius + jumpHeight(gravity, figure) + figure;
  const halfHeight = Math.tan((fovDegrees * Math.PI) / 360);
  // The camera looks down at an angle, which shortens how tall things seem, so 1.35 leaves room as well as a margin.
  const fit = (span / 2) * 1.35 / halfHeight;
  return { distance: Math.max(radius * 4.5, fit, 0.8), lift: Math.max(radius * 0.5, span / 2 - radius) };
}
