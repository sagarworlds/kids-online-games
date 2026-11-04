import { GameError } from '../../../engine/utils/errors.js';

/**
 * Small tools for describing the path a pencil takes. A path is a list of points `[x, y]` (y grows downwards, as on screen).
 * Letters are written as a few pieces (lines and arcs) joined into one path, then evened out so the points are the same
 * distance apart. The same list of points is drawn as the guide and used to check the child's tracing.
 *
 * @typedef {[number, number]} Point
 */

/** The distance between points once a path has been evened out, in drawing units. */
export const SPACING = 3;

/** @param {Point} a @param {Point} b @returns {number} */
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A straight line.
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @returns {Point[]}
 */
export const line = (x1, y1, x2, y2) => [[x1, y1], [x2, y2]];

/**
 * A corner-to-corner path through the points given.
 * @param {...Point} points
 * @returns {Point[]}
 */
export const poly = (...points) => points;

/**
 * Part of an ellipse. Angles are in degrees and go clockwise on the screen: 0 is the right side, 90 the bottom, 180 the left,
 * 270 the top. The arc runs from `from` to `to`, whichever way round that is the shorter way unless `to` is bigger or smaller
 * than `from` by more than 180.
 *
 * @param {number} cx @param {number} cy Centre.
 * @param {number} rx @param {number} ry Radii.
 * @param {number} from @param {number} to Start and end angles; `to` below `from` goes anticlockwise.
 * @returns {Point[]}
 */
export function arc(cx, cy, rx, ry, from, to) {
  const sweep = Math.abs(to - from);
  const steps = Math.max(4, Math.ceil(((Math.PI / 180) * sweep * Math.max(rx, ry)) / SPACING));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

/**
 * Joins pieces into one path, in order. Where one piece ends where the next begins the repeated point is dropped.
 * @param {...Point[]} pieces
 * @returns {Point[]}
 */
export function join(...pieces) {
  const out = [];
  for (const piece of pieces) {
    for (const point of piece) {
      const last = out[out.length - 1];
      if (!last || dist(last, point) > 0.01) out.push(point);
    }
  }
  return out;
}

/** The length of a path. @param {readonly Point[]} path @returns {number} */
export function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
  return total;
}

/**
 * Evens a path out so that the points are `spacing` apart (the last point is kept exactly). A path of one point, or of no
 * length, cannot be traced and is refused.
 *
 * @param {readonly Point[]} path
 * @param {number} [spacing]
 * @returns {Point[]}
 * @throws {GameError} 'BAD_PATH'
 */
export function resample(path, spacing = SPACING) {
  if (path.length < 2 || pathLength(path) < spacing) throw new GameError('BAD_PATH', 'A path needs two points that are apart', { points: path.length });
  const out = [[path[0][0], path[0][1]]];
  let carried = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const segment = dist(a, b);
    let at = spacing - carried;
    while (at <= segment) {
      out.push([a[0] + ((b[0] - a[0]) * at) / segment, a[1] + ((b[1] - a[1]) * at) / segment]);
      at += spacing;
    }
    carried = segment - (at - spacing);
  }
  const last = path[path.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.25) out.push([last[0], last[1]]);
  else out[out.length - 1] = [last[0], last[1]];
  return out;
}

/** @param {readonly Point[]} path @param {number} dx @param {number} dy @returns {Point[]} The path moved. */
export const shift = (path, dx, dy) => path.map(([x, y]) => [x + dx, y + dy]);

/** The box around some paths. @param {readonly (readonly Point[])[]} paths @returns {{ x0: number, y0: number, x1: number, y1: number }} */
export function bounds(paths) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const path of paths) for (const [x, y] of path) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/**
 * The point a given distance along a path.
 * @param {readonly Point[]} path
 * @param {number} distance
 * @returns {Point} The end point if the distance is past the end.
 */
export function pointAlong(path, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const segment = dist(path[i - 1], path[i]);
    if (left <= segment) {
      const t = segment === 0 ? 0 : left / segment;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    }
    left -= segment;
  }
  return path[path.length - 1];
}

/** SVG path text for a list of points. @param {readonly Point[]} path @returns {string} */
export const toSvgPath = (path) => path.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

/**
 * A path from a formula: `fn(t)` gives the point for t from 0 to 1.
 * @param {(t: number) => Point} fn
 * @param {number} [steps]
 * @returns {Point[]}
 */
export function param(fn, steps = 60) {
  return Array.from({ length: steps + 1 }, (_, i) => fn(i / steps));
}
