import { GameError } from './errors.js';

/**
 * A random source: any function returning a float in [0, 1).
 * `Math.random` qualifies, and so does the output of {@link createRng}.
 * Logic modules take one as an argument instead of calling Math.random, which
 * keeps them deterministic under test and enables seeded "daily" puzzles.
 * @typedef {() => number} Rng
 */

/**
 * Creates a seeded generator (mulberry32). The same seed always yields the
 * same sequence on every browser, which is what makes puzzles reproducible.
 * @param {number} seed Any integer; it is coerced to 32 bits.
 * @returns {Rng}
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    // mulberry32: small, fast and good enough for games (not for security).
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks a non-deterministic seed, using the platform CSPRNG when available.
 * @returns {number}
 */
export function randomSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 4294967296);
}

/**
 * Random integer in [min, max], both inclusive.
 * @param {Rng} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 * @throws {GameError} If max < min.
 */
export function randInt(rng, min, max) {
  if (max < min) {
    throw new GameError('BAD_RANGE', `randInt: max (${max}) is below min (${min})`, { min, max });
  }
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Picks one element.
 * @template T
 * @param {Rng} rng
 * @param {readonly T[]} items
 * @returns {T}
 * @throws {GameError} If the list is empty.
 */
export function pick(rng, items) {
  if (items.length === 0) throw new GameError('EMPTY_LIST', 'pick: cannot pick from an empty list');
  return items[Math.floor(rng() * items.length)];
}

/**
 * Fisher–Yates shuffle. Returns a new array and leaves the input untouched.
 * Unlike `sort(() => rng() - 0.5)`, every permutation is equally likely.
 * @template T
 * @param {Rng} rng
 * @param {readonly T[]} items
 * @returns {T[]}
 */
export function shuffle(rng, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Picks `count` distinct elements in random order.
 * @template T
 * @param {Rng} rng
 * @param {readonly T[]} items
 * @param {number} count
 * @returns {T[]}
 * @throws {GameError} If count exceeds the list length.
 */
export function sample(rng, items, count) {
  if (count > items.length) {
    throw new GameError('BAD_SAMPLE', `sample: wanted ${count} of ${items.length}`, { count });
  }
  return shuffle(rng, items).slice(0, count);
}
