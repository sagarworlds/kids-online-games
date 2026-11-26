import { GameError } from '../../../engine/utils/errors.js';

/**
 * How the 3D pads are laid out and how they move: pure numbers, so the layout, the colours, the camera and the press-and-glow can be tested without a
 * screen. The pads stand on a console in a grid, pad 0 at the back left and the rest in reading order, as in the flat grid.
 */

/** The size of a pad's top, the gap between pads, and how far a pad goes down when it is pressed. */
export const PAD_SIZE = 2.2;
export const PAD_GAP = 0.5;
export const PAD_TRAVEL = 0.3;

const assertCount = (count) => {
  if (count !== 4 && count !== 6) throw new GameError('BAD_PAD_COUNT', `Simon Says has 4 or 6 pads, not ${count}`, { count });
};

/** @param {number} count 4 or 6. @returns {{ cols: number, rows: number }} */
export function gridOf(count) {
  assertCount(count);
  return count === 4 ? { cols: 2, rows: 2 } : { cols: 3, rows: 2 };
}

/**
 * Where each pad stands: in reading order, the first row at the back (the top of the picture), centred on the origin.
 * @param {number} count 4 or 6.
 * @returns {{ x: number, z: number }[]} One for each pad, by pad number.
 */
export function padLayout(count) {
  const { cols, rows } = gridOf(count);
  const step = PAD_SIZE + PAD_GAP;
  return Array.from({ length: count }, (_, i) => ({
    x: ((i % cols) - (cols - 1) / 2) * step,
    z: (Math.floor(i / cols) - (rows - 1) / 2) * step,
  }));
}

/** @param {number} count @returns {number} How wide the whole board of pads is. */
export function boardWidth(count) {
  const { cols } = gridOf(count);
  return cols * PAD_SIZE + (cols - 1) * PAD_GAP;
}

/**
 * The outline of each pad's shape, as corners round a centre at the origin (in the flat pads' 64-unit picture, turned to be centred and the right way
 * up), scaled so that the shape is `size` across. A circle has no corners: it is `null`, and the view draws a round shape of that size.
 * @param {string} shape 'circle', 'square', 'triangle', 'star', 'hexagon' or 'diamond'.
 * @param {number} [size]
 * @returns {[number, number][]|null}
 * @throws {GameError} 'UNKNOWN_SHAPE'
 */
export function shapeOutline(shape, size = 1.2) {
  const flat = {
    circle: null,
    square: [[13, 13], [51, 13], [51, 51], [13, 51]],
    triangle: [[32, 10], [55, 52], [9, 52]],
    star: [[32, 8], [39, 25], [57, 26], [43, 38], [48, 56], [32, 46], [16, 56], [21, 38], [7, 26], [25, 25]],
    hexagon: [[32, 8], [54, 20], [54, 44], [32, 56], [10, 44], [10, 20]],
    diamond: [[32, 8], [54, 32], [32, 56], [10, 32]],
  };
  if (!(shape in flat)) throw new GameError('UNKNOWN_SHAPE', `There is no pad shape "${shape}"`, { shape });
  const points = flat[shape];
  if (!points) return null;
  // The flat picture has y going down; the solid has y going up. Each shape is centred on the middle of its own box, and sized to fit `size`.
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const k = size / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return points.map(([x, y]) => [(x - cx) * k, (cy - y) * k]);
}

/**
 * Blends a '#rrggbb' colour with white, for a pad's resting (unlit) look, as the flat pads do.
 * @param {string} hex
 * @param {number} amount 0 (the colour itself) to 1 (white).
 * @returns {string} '#rrggbb'
 * @throws {GameError} 'BAD_COLOR'
 */
export function lighten(hex, amount) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new GameError('BAD_COLOR', `A pad colour is '#rrggbb', not "${hex}"`, { hex });
  const n = parseInt(hex.slice(1), 16);
  const mix = (shift) => Math.round(((n >> shift) & 255) * (1 - amount) + 255 * amount);
  return `#${[16, 8, 0].map((s) => mix(s).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * How a pad looks at a level of lit-ness from 0 (resting) to 1 (pressed and glowing): how far down it has gone, and how big its glow is.
 * @param {number} level
 * @returns {{ drop: number, glow: number }}
 */
export function padPose(level) {
  const t = Math.min(1, Math.max(0, level));
  return { drop: PAD_TRAVEL * t, glow: t };
}

/**
 * The first view of the pads: from the front and above, far enough back that the whole board fits the picture at its shape.
 * @param {number} count 4 or 6.
 * @param {number} aspect Width over height of the picture.
 * @returns {{ azimuth: number, polar: number, distance: number, target: { x: number, y: number, z: number } }}
 */
export function startView(count, aspect) {
  const width = boardWidth(count) + 1.6;
  const { rows } = gridOf(count);
  const depth = rows * PAD_SIZE + (rows - 1) * PAD_GAP + 1.6;
  const fov = (40 * Math.PI) / 180;
  const half = 2 * Math.tan(fov / 2);
  // The picture shows `half * distance` high and that times the aspect wide; the board seen from above at this angle is about as tall as it is deep.
  const fitWidth = width / (half * Math.max(0.5, aspect));
  const fitDepth = (depth * 0.9) / half;
  return { azimuth: 0, polar: 0.8, distance: Math.max(7, fitWidth, fitDepth) * 1.05, target: { x: 0, y: 0, z: 0 } };
}

/**
 * How far the camera may be turned and zoomed: never under the console, never so low that pads hide one another, never so close that the board is lost.
 * @param {number} count
 * @param {number} aspect
 */
export function viewLimits(count, aspect) {
  const { distance } = startView(count, aspect);
  return { minPolar: 0.3, maxPolar: 1.25, minDistance: Math.max(5, distance * 0.5), maxDistance: distance * 1.6 };
}
