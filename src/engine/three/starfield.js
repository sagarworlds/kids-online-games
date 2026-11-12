import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from './three.js';
import { createRng } from '../utils/random.js';

/**
 * A field of stars on a distant shell around the scene: the backdrop of every space-themed 3D version. Drawn as one point
 * cloud (one draw call), which is far cheaper than a sphere for each star.
 */

/**
 * Where the stars are, as a flat list of x, y, z. The same seed always gives the same sky, so it never looks like
 * something changed on the child between visits. Stars are spread evenly over the sphere (not bunched at the poles).
 *
 * @param {{ count: number, seed: number, minRadius: number, spread: number }} options Each star sits between `minRadius`
 *   and `minRadius + spread` from the middle.
 * @returns {number[]}
 */
export function starPositions({ count, seed, minRadius, spread }) {
  const rng = createRng(seed);
  const positions = [];
  for (let i = 0; i < count; i++) {
    const turn = rng() * Math.PI * 2;
    const lift = rng() * 2 - 1; // the height is uniform, which is what spreads points evenly over a sphere
    const ring = Math.sqrt(1 - lift * lift);
    const distance = minRadius + rng() * spread;
    positions.push(Math.cos(turn) * ring * distance, lift * distance, Math.sin(turn) * ring * distance);
  }
  return positions;
}

/**
 * @param {{ count: number, seed: number, minRadius?: number, spread?: number, size?: number, color?: string }} options
 *   `minRadius` must be inside the camera's far plane. `size` is each star's width in scene units.
 * @returns {import('./three.js').Points}
 */
export function createStarfield({ count, seed, minRadius = 110, spread = 25, size = 0.8, color = '#ffffff' }) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(starPositions({ count, seed, minRadius, spread }), 3));
  return new Points(geometry, new PointsMaterial({ color, size, sizeAttenuation: true }));
}
