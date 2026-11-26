import { GameError } from '../../../engine/utils/errors.js';

/**
 * How the 3D night sky is laid out and how its little effects move: pure numbers, so the mapping from a star's place in the round to a place in the
 * picture, the two halves of a sliced star and the sparks can be tested without a screen.
 *
 * The round gives each star `x` (its lane, 0 to 1 across) and `y` (0 at the top, 1 on the ground). The picture is a flat sheet of sky seen straight
 * on from a fixed camera (a falling game must not be turned away from the child), and the stars are solids that spin as they fall.
 */

export const CAMERA_DISTANCE = 14;
export const FOV = 45;
export const STAR_RADIUS = 0.95;
/** The room kept under a landed star for its sum's plate, and above the top star, in world units. */
const PLATE_ROOM = 1.55;
const TOP_ROOM = 0.35;

/**
 * The size of the sheet of sky the camera sees at the distance the stars are at.
 * @param {number} aspect Width over height of the picture.
 * @returns {{ width: number, height: number }} In world units.
 * @throws {GameError} 'BAD_ASPECT'
 */
export function skySize(aspect) {
  if (!(aspect > 0) || !Number.isFinite(aspect)) throw new GameError('BAD_ASPECT', `The picture's shape must be a positive number, not ${aspect}`, { aspect });
  const height = 2 * CAMERA_DISTANCE * Math.tan((FOV * Math.PI) / 360);
  return { width: height * aspect, height };
}

/**
 * Where a star is in the picture, from where it is in the round.
 * @param {{ x: number, y: number }} problem `x` the lane (0 to 1 across), `y` how far it has fallen (0 top, 1 landed).
 * @param {number} aspect
 * @returns {{ x: number, y: number }} World units, the middle of the sky being (0, 0). A star that has landed rests with its plate just above the floor.
 */
export function starPosition({ x, y }, aspect) {
  const { width, height } = skySize(aspect);
  const top = height / 2 - STAR_RADIUS - TOP_ROOM;
  const landed = -height / 2 + STAR_RADIUS + PLATE_ROOM;
  const fall = Math.min(1, Math.max(0, y));
  return { x: (x - 0.5) * width, y: top + (landed - top) * fall };
}

/** @param {number} aspect @returns {number} Where the floor's top is. */
export const floorLevel = (aspect) => -skySize(aspect).height / 2 + 0.55;

/** A star in the bottom quarter of its fall gets a warning on its plate (a shape and a "!", not only a colour). */
export const URGENT_FROM = 0.75;
export const isUrgent = (y) => y >= URGENT_FROM;

/**
 * The outline of a five-pointed star with a point straight up, centred on the origin.
 * @param {number} outer Radius of the points.
 * @param {number} inner Radius of the notches.
 * @returns {[number, number][]} Ten corners, clockwise from the top point.
 */
export function starOutline(outer, inner) {
  // A corner that should be exactly on the line x = 0 (the top point and the notch under it) is snapped to it: left as 1e-17 it would count as being on
  // one side of the cut only, and the two halves would come out with different corners.
  const snap = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 - (i * Math.PI) / 5; // clockwise from the top
    return [snap(Math.cos(a) * r), snap(Math.sin(a) * r)];
  });
}

/**
 * One half of a shape, cut down the line x = 0 (Sutherland-Hodgman against a half-plane, which is right for a shape like a star that is not convex).
 * @param {readonly (readonly [number, number])[]} points Corners in order.
 * @param {-1|1} side -1 keeps the left half (x <= 0), 1 the right half (x >= 0).
 * @returns {[number, number][]} The corners of that half, including the two where the cut crosses the outline.
 * @throws {GameError} 'BAD_SIDE'
 */
export function halfOf(points, side) {
  if (side !== -1 && side !== 1) throw new GameError('BAD_SIDE', `A half is the left (-1) or the right (1), not ${side}`, { side });
  const inside = ([x]) => x * side >= 0;
  const cut = ([ax, ay], [bx, by]) => {
    const t = ax / (ax - bx); // where along a-b the line x = 0 is crossed
    return [0, ay + (by - ay) * t];
  };
  const out = [];
  points.forEach((current, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    if (inside(current)) {
      if (!inside(previous)) out.push(cut(previous, current));
      out.push([current[0], current[1]]);
    } else if (inside(previous)) {
      out.push(cut(previous, current));
    }
  });
  return out;
}

/** @param {readonly (readonly [number, number])[]} points @returns {number} The area (the shoelace formula; positive whichever way round the corners go). */
export function polygonArea(points) {
  let sum = 0;
  points.forEach(([x, y], i) => { const [nx, ny] = points[(i + 1) % points.length]; sum += x * ny - nx * y; });
  return Math.abs(sum) / 2;
}

/** How long each effect lasts, in seconds. */
export const SLICE_SECONDS = 0.55;
export const TEXT_SECONDS = 0.9;
export const REVEAL_SECONDS = 1.5;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Where one half of a sliced star is: it drifts apart from the other half, falls faster and faster, turns, and fades.
 * @param {-1|1} side
 * @param {number} age Seconds since the slice.
 * @returns {{ x: number, y: number, rotation: number, opacity: number }} Offsets from where the star was; `rotation` is about the view axis.
 */
export function halfMotion(side, age) {
  const t = clamp01(age / SLICE_SECONDS);
  return { x: side * 2.2 * t, y: -3.4 * t * t, rotation: -side * t * 1.4, opacity: 1 - t };
}

/**
 * Where one spark of the burst is.
 * @param {number} angle Radians, the direction it flies in.
 * @param {number} age Seconds since the burst.
 * @param {number} [reach] How far it flies, in world units.
 * @returns {{ x: number, y: number, scale: number, opacity: number }} Offsets from the burst's middle.
 */
export function sparkMotion(angle, age, reach = 2.5) {
  const t = clamp01(age / 0.5);
  return { x: Math.cos(angle) * reach * t, y: Math.sin(angle) * reach * t, scale: 1 - t * 0.8, opacity: 1 - t };
}

/**
 * The "✔ +10" that floats up from a sliced star.
 * @param {number} age Seconds since the slice.
 * @param {boolean} still True for a child who asked for less motion: it stays where it is and just fades.
 * @returns {{ y: number, opacity: number }}
 */
export function risingText(age, still = false) {
  const t = clamp01(age / TEXT_SECONDS);
  return { y: still ? 0 : 1.8 * t, opacity: 1 - t * t };
}

/**
 * How visible the plate that reveals a missed star's answer is: fully, until its last 0.3 seconds, when it fades.
 * @param {number} age Seconds since the star landed.
 * @returns {number} 0 to 1.
 */
export const revealOpacity = (age) => clamp01((REVEAL_SECONDS - age) / 0.3);
