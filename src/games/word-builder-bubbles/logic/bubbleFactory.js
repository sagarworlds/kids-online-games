import { GameError } from '../../../engine/utils/errors.js';
import { clamp } from '../../../engine/utils/geometry.js';
import { randInt, shuffle } from '../../../engine/utils/random.js';

/**
 * @typedef {{ id: number, letter: string, x: number, y: number, vx: number, vy: number, r: number, isDecoy: boolean }} Bubble
 * @typedef {{ width: number, height: number }} Bounds
 */

export const MAX_RADIUS = 46;
export const MIN_RADIUS = 22;
/** Bubbles keep at least this much clear space between them when they are placed. */
const GAP = 6;
const ATTEMPTS = 60;

/** @param {Bubble} a @param {Bubble} b @returns {boolean} True when the two circles overlap (touching is fine). */
export function overlaps(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

/**
 * The bubble radius for a play area: big enough to tap, small enough that `count` of them fit with room to drift.
 * They may fill about a quarter of the area. Phones get smaller bubbles but never smaller than MIN_RADIUS.
 * @param {number} count
 * @param {Bounds} bounds
 * @returns {number}
 */
export function radiusFor(count, bounds) {
  const byArea = Math.sqrt((bounds.width * bounds.height * 0.26) / (count * Math.PI));
  return clamp(Math.floor(byArea), MIN_RADIUS, MAX_RADIUS);
}

/** Random direction at a given speed. */
function velocity(speed, rng) {
  const angle = rng() * Math.PI * 2;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/** Places circles on a grid: slower to look at, but always free of overlaps when the grid has room. */
function gridPositions(count, r, bounds, rng) {
  const cell = 2 * r + GAP;
  const cols = Math.max(1, Math.floor(bounds.width / cell));
  const rows = Math.max(1, Math.floor(bounds.height / cell));
  if (cols * rows < count) {
    throw new GameError('NO_ROOM', `${count} bubbles of radius ${r} do not fit in ${bounds.width} x ${bounds.height}`, { count, r, ...bounds });
  }
  const slots = shuffle(rng, Array.from({ length: cols * rows }, (_, i) => i)).slice(0, count);
  const offsetX = (bounds.width - cols * cell) / 2 + cell / 2;
  const offsetY = (bounds.height - rows * cell) / 2 + cell / 2;
  return slots.map((i) => ({ x: offsetX + (i % cols) * cell, y: offsetY + Math.floor(i / cols) * cell }));
}

/**
 * Creates the bubbles for a word: one per letter still to spell, plus the decoys, all different from each other in
 * position and none overlapping. Random placement is tried first; if the area is too tight for that, a grid is used,
 * which cannot overlap.
 *
 * @param {{ letters: readonly string[], decoys: readonly string[] }} content `letters` in any order (repeated letters each get a bubble).
 * @param {Bounds} bounds
 * @param {() => number} rng
 * @param {number} speed Pixels per second.
 * @returns {Bubble[]}
 * @throws {GameError} 'NO_ROOM' if even the smallest bubbles cannot fit.
 */
export function createBubbles({ letters, decoys }, bounds, rng, speed) {
  const specs = [
    ...letters.map((letter) => ({ letter, isDecoy: false })),
    ...decoys.map((letter) => ({ letter, isDecoy: true })),
  ];
  const r = radiusFor(specs.length, bounds);
  const placed = [];
  let failed = false;
  for (const spec of specs) {
    let spot = null;
    for (let attempt = 0; attempt < ATTEMPTS && !spot; attempt++) {
      const x = randInt(rng, Math.ceil(r), Math.floor(bounds.width - r));
      const y = randInt(rng, Math.ceil(r), Math.floor(bounds.height - r));
      if (placed.every((b) => Math.hypot(b.x - x, b.y - y) >= b.r + r + GAP)) spot = { x, y };
    }
    if (!spot) { failed = true; break; }
    placed.push({ ...spot, r });
  }
  const spots = failed ? gridPositions(specs.length, r, bounds, rng) : placed;
  return shuffle(rng, specs).map((spec, i) => ({
    id: i + 1, letter: spec.letter, isDecoy: spec.isDecoy, r, x: spots[i].x, y: spots[i].y, ...velocity(speed, rng),
  }));
}

/**
 * A replacement for a bubble that was popped by mistake: same letter, drifting back in from the bottom edge.
 * It tries not to land on another bubble but, unlike `createBubbles`, may touch one if the area is crowded (it enters
 * from outside the play area, and Hard's collisions push bubbles apart).
 *
 * @param {Bubble} old
 * @param {readonly Bubble[]} others
 * @param {Bounds} bounds
 * @param {() => number} rng
 * @param {number} speed
 * @param {number} id A fresh id.
 * @returns {Bubble}
 */
export function respawn(old, others, bounds, rng, speed, id) {
  const r = old.r;
  let x = randInt(rng, Math.ceil(r), Math.floor(bounds.width - r));
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (others.every((b) => Math.hypot(b.x - x, bounds.height - r - b.y) >= b.r + r)) break;
    x = randInt(rng, Math.ceil(r), Math.floor(bounds.width - r));
  }
  const { vx } = velocity(speed, rng);
  return { id, letter: old.letter, isDecoy: old.isDecoy, r, x, y: bounds.height - r, vx, vy: -Math.abs(speed) };
}
