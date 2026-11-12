import { GameError } from '../../../engine/utils/errors.js';
import { createRng } from '../../../engine/utils/random.js';

/**
 * How the 3D board is laid out and how it moves: pure numbers, so the layout, the camera and the little animations can be tested without a
 * screen. Row 0 is at the back of the board (the top of the picture, as in the flat grid) and column 0 on the left.
 *
 * @typedef {boolean[][]} Board
 */

/** The distance between the middles of two neighbouring jars, and the size of a jar. */
export const CELL = 1.35;
export const JAR_RADIUS = 0.46;
export const JAR_HEIGHT = 1.0;
/** How high a jar's glass starts above the table (it stands on a coaster this thick). */
export const JAR_BASE = 0.12;

const assertSize = (size) => {
  if (!Number.isInteger(size) || size < 1) throw new GameError('BAD_BOARD_SIZE', `A board is at least 1 by 1, not ${size}`, { size });
};

/**
 * Where the jar at row `r`, column `c` stands. The board is centred on the origin.
 * @param {number} r
 * @param {number} c
 * @param {number} size Jars along one side.
 * @returns {{ x: number, z: number }}
 * @throws {GameError} 'BAD_BOARD_SIZE' / 'OUT_OF_BOARD'
 */
export function cellPosition(r, c, size) {
  assertSize(size);
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= size || c >= size) {
    throw new GameError('OUT_OF_BOARD', `(${r}, ${c}) is not on a ${size}x${size} board`, { r, c, size });
  }
  const middle = (size - 1) / 2;
  return { x: (c - middle) * CELL, z: (r - middle) * CELL };
}

/** @param {number} size @returns {number} How wide the board is, edge to edge, with a little margin round the outer jars. */
export function boardWidth(size) {
  assertSize(size);
  return (size - 1) * CELL + CELL * 1.1;
}

/**
 * The jars whose state is different between two boards: after a tap, the jar and its neighbours.
 * @param {Board} before
 * @param {Board} after
 * @returns {[number, number][]} [row, column] pairs, row by row.
 */
export function changedCells(before, after) {
  const changed = [];
  after.forEach((row, r) => row.forEach((lit, c) => { if (lit !== before[r]?.[c]) changed.push([r, c]); }));
  return changed;
}

/**
 * The first view of the board: from the front and above, far enough back that the whole board fits (a bigger board needs more room).
 * @param {number} size
 * @returns {{ azimuth: number, polar: number, distance: number, target: { x: number, y: number, z: number } }}
 */
export function startView(size) {
  assertSize(size);
  return { azimuth: 0, polar: 0.95, distance: 4.2 + boardWidth(size) * 1.3, target: { x: 0, y: 0.3, z: 0 } };
}

/**
 * How far the camera may be turned and zoomed: never under the table, never straight down or edge on, never so close that the board is lost
 * and never so far that the jars are specks.
 * @param {number} size
 */
export function viewLimits(size) {
  const { distance } = startView(size);
  return { minPolar: 0.3, maxPolar: 1.42, minDistance: Math.max(5, distance * 0.45), maxDistance: distance * 1.8 };
}

/** How long a jar bounces after it is flipped, in seconds, and how high. */
export const BOUNCE_SECONDS = 0.35;
const BOUNCE_HEIGHT = 0.3;

/**
 * The height of a jar's little bounce, `age` seconds after it was flipped: up and back down, ending at exactly 0.
 * @param {number} age
 * @returns {number}
 */
export function bounce(age) {
  if (!(age > 0) || age >= BOUNCE_SECONDS) return 0;
  return Math.sin(Math.PI * (age / BOUNCE_SECONDS)) * BOUNCE_HEIGHT * (1 - age / BOUNCE_SECONDS);
}

/** How long the fireflies take to fly away when the puzzle is solved, in seconds. */
export const FLIGHT_SECONDS = 2.4;

/**
 * Where the fireflies go when they are set free: each one starts in its jar, then rises and drifts sideways, wobbling as it goes. The same
 * seed always gives the same flights, so they can be tested.
 * @param {{ count: number, seed: number }} options
 * @returns {{ driftX: number, driftZ: number, rise: number, delay: number, phase: number }[]}
 */
export function fireflyFlights({ count, seed }) {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({
    driftX: (rng() - 0.5) * 4, driftZ: (rng() - 0.5) * 4, rise: 3 + rng() * 3, delay: rng() * 0.4, phase: rng() * Math.PI * 2,
  }));
}

/**
 * How far along its flight a firefly is (0 at the start, 1 at the end), from the time since it was set free and its own delay. It stays at the
 * start until its delay is over, and at the end afterwards.
 * @param {number} age
 * @param {number} delay
 * @returns {number}
 */
export function flightProgress(age, delay) {
  return Math.min(1, Math.max(0, (age - delay) / (FLIGHT_SECONDS - 0.4)));
}
