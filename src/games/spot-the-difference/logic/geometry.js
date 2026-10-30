/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 * @typedef {{ id: string, template: string, x: number, y: number, scale: number, color: string, flip: boolean, rotation: number }} SceneObject
 */

/**
 * The box (in scene units) that surely holds an object: its template's size, scaled and turned about its centre. Flipping
 * mirrors it about its centre, so it does not change the box.
 * @param {SceneObject} object
 * @param {{ w: number, h: number }} template
 * @returns {Box}
 */
export function objectBox(object, template) {
  const hw = (template.w * object.scale) / 2;
  const hh = (template.h * object.scale) / 2;
  const a = (object.rotation * Math.PI) / 180;
  const ex = Math.abs(Math.cos(a)) * hw + Math.abs(Math.sin(a)) * hh;
  const ey = Math.abs(Math.sin(a)) * hw + Math.abs(Math.cos(a)) * hh;
  return { x: object.x - ex, y: object.y - ey, w: 2 * ex, h: 2 * ey };
}

/** @param {Box} a @param {Box} b @param {number} [gap] @returns {boolean} True if closer than `gap` (touching counts when gap is 0 or more... strictly closer). */
export const boxesOverlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

/** @param {Box} a @param {Box} b @returns {Box} The smallest box holding both. */
export function unionBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** @param {Box} box @param {number} pad @returns {Box} */
export const inflateBox = (box, pad) => ({ x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad });

/** @param {Box} box @param {{ w: number, h: number }} bounds @param {number} [margin] @returns {boolean} */
export const boxInBounds = (box, bounds, margin = 0) => box.x >= margin && box.y >= margin && box.x + box.w <= bounds.w - margin && box.y + box.h <= bounds.h - margin;

/** @param {Box} box @param {{ x: number, y: number }} p @returns {boolean} Inside or on the edge. */
export const boxContains = (box, p) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;

/** @param {Box} box @returns {{ x: number, y: number }} */
export const boxCentre = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
