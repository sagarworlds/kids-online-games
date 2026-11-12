import { GameError } from '../../../engine/utils/errors.js';

/**
 * The geometry of the 3D "split the sum" slabs. A sum such as 17 × 6 is drawn as slabs of unit squares: a slab 10 wide and 6
 * deep (10 × 6 = 60) beside a slab 7 wide and 6 deep (7 × 6 = 42), so the child sees that the two parts make the whole.
 * Pure numbers (no three.js), so the layout and the camera are tested without a browser.
 *
 * x runs along the row of slabs, z is the number of rows (depth), y is up, and one unit is one square of the table.
 *
 * @typedef {{ index: number, factor: number, rows: number, product: number, x: number, width: number, depth: number }} Slab
 *   `x` is the middle of the slab; `width` is its factor and `depth` the number of rows.
 */

/** The thickness of a slab and the space between two slabs, in units. */
export const SLAB_HEIGHT = 0.45;
export const SLAB_GAP = 1.4;

/**
 * Lays the slabs out side by side, the row centred on x = 0.
 * @param {{ factors: readonly number[], rows: number }} options `factors` are the parts of the table (17 gives 10 and 7).
 * @returns {{ slabs: Slab[], totalWidth: number }}
 * @throws {GameError} 'BAD_SLABS' unless there is at least one whole-number factor and `rows` is a whole number from 1.
 */
export function slabLayout({ factors, rows }) {
  const ok = Array.isArray(factors) && factors.length > 0 && factors.every((f) => Number.isInteger(f) && f > 0) && Number.isInteger(rows) && rows >= 1;
  if (!ok) throw new GameError('BAD_SLABS', 'slabs need whole-number parts and a whole number of rows', { factors, rows });
  const totalWidth = factors.reduce((sum, f) => sum + f, 0) + SLAB_GAP * (factors.length - 1);
  let left = -totalWidth / 2;
  const slabs = factors.map((factor, index) => {
    const slab = { index, factor, rows, product: factor * rows, x: left + factor / 2, width: factor, depth: rows };
    left += factor + SLAB_GAP;
    return slab;
  });
  return { slabs, totalWidth };
}

/**
 * Where the camera stands to see all the slabs, from the front and above, whatever the shape of the picture.
 * @param {{ totalWidth: number, rows: number, aspect: number, fovDegrees?: number }} options
 * @returns {{ azimuth: number, polar: number, distance: number }}
 */
export function slabFraming({ totalWidth, rows, aspect, fovDegrees = 45 }) {
  const half = Math.tan((fovDegrees * Math.PI) / 360);
  const wide = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const forWidth = (totalWidth * 0.56) / (half * wide) + rows * 0.5;
  const forDepth = ((rows + 3) * 0.5) / half;
  return { azimuth: 0, polar: 0.95, distance: Math.min(120, Math.max(8, forWidth, forDepth)) };
}
