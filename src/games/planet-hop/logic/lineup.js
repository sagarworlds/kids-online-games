import { GameError } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { ordinal } from './planets.js';

/**
 * @typedef {{
 *   planets: readonly import('./planets.js').Planet[],
 *   pool: readonly string[], placed: readonly (string|null)[], wrongDrops: number
 * }} LineupState
 * `pool` is the planets still floating, in the order shown; `placed[i]` is the planet in orbit slot i (0 is next to the Sun).
 */

const MAX_WRONG_FOR_3_STARS = 1;
const MAX_WRONG_FOR_2_STARS = 3;

/**
 * Starts a line-up with the planets floating in a random order that is never already the right one.
 * @param {readonly import('./planets.js').Planet[]} planets
 * @param {import('../../../engine/utils/random.js').Rng} rng
 * @returns {LineupState}
 */
export function createLineup(planets, rng) {
  const ids = planets.map((p) => p.id);
  const inOrder = (list) => list.every((id, i) => id === planets[i].id);
  let pool = shuffle(rng, ids);
  // Start from a mixed-up pool: a sorted one would make the first round a lesson in nothing. Each reshuffle is
  // different, so this ends quickly; the cap only protects against a broken rng.
  for (let attempt = 0; inOrder(pool) && attempt < 20; attempt++) pool = shuffle(rng, ids);
  return { planets, pool, placed: planets.map(() => null), wrongDrops: 0 };
}

/**
 * @param {readonly import('./planets.js').Planet[]} planets
 * @param {string} planetId
 * @param {number} slotIndex 0 is the orbit next to the Sun.
 * @returns {boolean} True if that planet belongs in that slot.
 * @throws {GameError} 'UNKNOWN_PLANET'.
 */
export function isCorrectSlot(planets, planetId, slotIndex) {
  const planet = planets.find((p) => p.id === planetId);
  if (!planet) throw new GameError('UNKNOWN_PLANET', `There is no planet "${planetId}"`, { planetId });
  return planet.order === slotIndex + 1;
}

/** The hint after a wrong drop, such as "Mars is the 4th planet, the red one." @param {import('./planets.js').Planet} planet */
export const hintFor = (planet) => `${planet.name} is the ${ordinal(planet.order)} planet, ${planet.look}.`;

/**
 * Tries to put a planet into an orbit slot. A wrong slot changes nothing but the count of wrong drops, and gives a hint.
 *
 * @param {LineupState} state
 * @param {string} planetId A planet still in the pool.
 * @param {number} slotIndex An empty slot.
 * @returns {{ state: LineupState, correct: boolean, hint: string|null }}
 * @throws {GameError} 'ALREADY_PLACED', 'BAD_SLOT' or 'SLOT_TAKEN' (the screen never offers these; they flag a bug), 'UNKNOWN_PLANET'.
 */
export function place(state, planetId, slotIndex) {
  const planet = state.planets.find((p) => p.id === planetId);
  if (!planet) throw new GameError('UNKNOWN_PLANET', `There is no planet "${planetId}"`, { planetId });
  if (!state.pool.includes(planetId)) throw new GameError('ALREADY_PLACED', `${planet.name} is already in orbit`, { planetId });
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= state.placed.length) {
    throw new GameError('BAD_SLOT', `There is no orbit slot ${slotIndex}`, { slotIndex });
  }
  if (state.placed[slotIndex] !== null) throw new GameError('SLOT_TAKEN', `Orbit slot ${slotIndex} is already full`, { slotIndex });

  if (!isCorrectSlot(state.planets, planetId, slotIndex)) {
    return { state: { ...state, wrongDrops: state.wrongDrops + 1 }, correct: false, hint: hintFor(planet) };
  }
  const placed = state.placed.map((id, i) => (i === slotIndex ? planetId : id));
  return { state: { ...state, pool: state.pool.filter((id) => id !== planetId), placed }, correct: true, hint: null };
}

/** @param {LineupState} state @returns {boolean} True when every planet is in orbit. */
export const allPlaced = (state) => state.pool.length === 0;

/**
 * Stars for a line-up: 0 or 1 wrong drops = 3, 2 or 3 = 2, more = 1.
 * @param {number} wrongDrops
 * @returns {1|2|3}
 */
export function lineupStars(wrongDrops) {
  if (wrongDrops <= MAX_WRONG_FOR_3_STARS) return 3;
  if (wrongDrops <= MAX_WRONG_FOR_2_STARS) return 2;
  return 1;
}

/** Score for a line-up: 100 minus 10 for each wrong drop, never below 10. @param {number} wrongDrops */
export const lineupScore = (wrongDrops) => Math.max(10, 100 - wrongDrops * 10);
