import { GameError } from '../../../engine/utils/errors.js';

/**
 * How the 3D case file is laid out and how it moves: pure numbers, so the layout, the camera and the little animations can be tested without a
 * screen. Items stand on pedestals in a row from left to right, in the order of the sequence, seen from the front.
 *
 * @typedef {import('./equality.js').Token} Token
 */

/** What each flat shape of a case becomes in 3D. (There is no cylinder: the cases have no shape for one.) */
export const SOLID_NAMES = Object.freeze({
  circle: 'sphere', square: 'cube', triangle: 'cone', star: 'star', arrow: 'arrow',
});

/**
 * @param {string} shape A shape of a case.
 * @returns {string} The solid it is drawn as: 'sphere', 'cube', 'cone', 'star' or 'arrow'.
 * @throws {GameError} 'UNKNOWN_SHAPE'
 */
export function solidName(shape) {
  const name = SOLID_NAMES[shape];
  if (!name) throw new GameError('UNKNOWN_SHAPE', `There is no solid for the shape "${shape}"`, { shape });
  return name;
}

/**
 * What a child is told when they tap a solid: its colour and what solid it is ("orange sphere", "3 sky cubes").
 * @param {Token} token
 * @returns {string}
 */
export function describeSolid(token) {
  const name = solidName(token.shape);
  if (token.shape === 'arrow') return `${token.color} arrow`;
  const count = token.count ?? 1;
  return count > 1 ? `${count} ${token.color} ${name}s` : `${token.color} ${name}`;
}

/** The distance between the middles of two neighbouring pedestals, and the half-width of a pedestal's top. */
export const SPACING = 2;
export const PEDESTAL_HALF = 0.78;

const assertCount = (count, what) => {
  if (!Number.isInteger(count) || count < 1) throw new GameError('BAD_COUNT', `${what} must be a whole number of at least 1, not ${count}`, { count });
};

/**
 * Where a pedestal stands. The row is centred on the origin.
 * @param {number} index
 * @param {number} total How many items the sequence has.
 * @returns {{ x: number, z: number }}
 */
export function itemPosition(index, total) {
  assertCount(total, 'The sequence length');
  if (!Number.isInteger(index) || index < 0 || index >= total) throw new GameError('OUT_OF_SEQUENCE', `There is no item ${index} in a sequence of ${total}`, { index, total });
  return { x: (index - (total - 1) / 2) * SPACING, z: 0 };
}

/**
 * Where the solids of a group sit on their pedestal (a growing pattern shows 1, 2, 3 ... of the same shape): in a row, or in two rows once there
 * are more than four, and smaller the more there are so that they all fit. The same layout the flat picture uses.
 * @param {number} count
 * @returns {{ x: number, z: number, scale: number }[]} Positions on the pedestal's top, which runs from -PEDESTAL_HALF to +PEDESTAL_HALF.
 */
export function groupLayout(count) {
  assertCount(count, 'A group');
  const cols = count <= 4 ? count : Math.ceil(count / 2);
  const rows = count <= 4 ? 1 : 2;
  const cell = Math.min(1 / cols, 1 / rows);
  const scale = cell * (count === 1 ? 1 : 0.95);
  return Array.from({ length: count }, (_, i) => ({
    x: (((i % cols) + 0.5) / cols - 0.5) * 2 * PEDESTAL_HALF,
    z: rows === 1 ? 0 : ((Math.floor(i / cols) + 0.5) / rows - 0.5) * 2 * PEDESTAL_HALF,
    scale,
  }));
}

/**
 * The turn about the vertical axis of an arrow that points away from the camera at 0 degrees and turns clockwise, seen from above, as the case's
 * rotation says (a turn about y by a positive angle goes the other way, hence the minus).
 * @param {number} degrees
 * @returns {number} Radians.
 */
export const arrowYaw = (degrees) => -(degrees * Math.PI) / 180;

/**
 * How far a solid has turned while it idles: slowly, each at its own pace and starting point so a row of them does not turn in step.
 * @param {number} clock Seconds.
 * @param {number} index
 * @returns {number} Radians.
 */
export const spinAngle = (clock, index) => clock * (0.55 + (index % 3) * 0.12) + index * 1.3;

/** How long a tapped solid's whole turn takes, in seconds. */
export const SPIN_SECONDS = 0.9;

/**
 * The extra turn a tapped solid makes: one whole turn that starts fast and slows, ending exactly where it began.
 * @param {number} age Seconds since the tap.
 * @returns {number} Radians, from 0 up to a whole turn.
 */
export function kickAngle(age) {
  if (!(age > 0)) return 0;
  if (age >= SPIN_SECONDS) return 0; // a whole turn is the same as none: the solid is back where it was
  const t = age / SPIN_SECONDS;
  return (1 - (1 - t) ** 3) * Math.PI * 2;
}

/** How long the answer takes to drop into the gap, in seconds, and how high it starts. */
export const DROP_SECONDS = 0.8;
const DROP_FROM = 4;

/**
 * The height above its pedestal of the answer as it drops into the gap: it falls, bounces a little, and ends exactly on the pedestal.
 * @param {number} age Seconds since the answer was chosen.
 * @returns {number} Height above the pedestal's top (0 once it has landed).
 */
export function dropHeight(age) {
  if (!(age >= 0)) return DROP_FROM;
  if (age >= DROP_SECONDS) return 0;
  const t = age / DROP_SECONDS;
  const fall = DROP_FROM * (1 - t * t);
  // A small bounce over the last part of the drop, dying away to nothing at the end.
  return Math.max(0, fall + Math.abs(Math.sin(t * Math.PI * 3)) * 0.35 * t * (1 - t) * 4);
}

/**
 * The first view of the case file: from the front and a little above, far enough back that the whole row fits the picture at its shape.
 * @param {number} total How many items the sequence has.
 * @param {number} aspect Width over height of the picture.
 * @returns {{ azimuth: number, polar: number, distance: number, target: { x: number, y: number, z: number } }}
 */
export function startView(total, aspect) {
  assertCount(total, 'The sequence length');
  const width = (total - 1) * SPACING + SPACING * 1.15;
  const fov = (40 * Math.PI) / 180;
  // The picture shows 2 * distance * tan(fov / 2) high, and that times the aspect wide; the row has to fit the width (with some air above it).
  const fit = width / (2 * Math.tan(fov / 2) * Math.max(0.5, aspect));
  return { azimuth: 0, polar: 1.12, distance: Math.max(8, fit * 1.02), target: { x: 0, y: 0.2, z: 0 } };
}

/**
 * How far the camera may be turned and zoomed: never under the table, never straight down, never so close that the row is lost.
 * @param {number} total
 * @param {number} aspect
 */
export function viewLimits(total, aspect) {
  const { distance } = startView(total, aspect);
  return { minPolar: 0.35, maxPolar: 1.45, minDistance: Math.max(5, distance * 0.4), maxDistance: distance * 1.7 };
}
