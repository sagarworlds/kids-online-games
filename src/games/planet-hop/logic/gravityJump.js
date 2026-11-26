import { GameError } from '../../../engine/utils/errors.js';

/**
 * The jump the astronaut does on every body, so the child *sees* what gravity does.
 *
 * The rule: the astronaut pushes off with the same effort everywhere. With the same push, a jump is as high as
 * 1 / gravity and lasts as long as 1 / gravity (height = v^2 / 2g and time = 2v / g for the same speed v). So on the
 * Moon (0.17) the jump is about 6 times as high and hangs about 6 times as long as on Earth, and on Jupiter (2.53) it
 * is a short little hop. That is real physics, not a cartoon, which is why nothing here is capped.
 */

/** How long one jump takes on Earth, in seconds (everything else is this divided by the gravity). */
export const EARTH_JUMP_SECONDS = 0.8;
/** How high one jump goes on Earth, as a share of the astronaut's height. */
export const EARTH_JUMP_HEIGHTS = 0.5;
/** A long jump (Moon) is done once; a short one is done twice, so nobody watches for a quarter of a minute. */
const LONG_JUMP_SECONDS = 2.5;

/** @param {number} gravity @throws {GameError} 'BAD_GRAVITY' unless it is a positive number. */
function checkGravity(gravity) {
  if (typeof gravity !== 'number' || !Number.isFinite(gravity) || gravity <= 0) {
    throw new GameError('BAD_GRAVITY', `gravity must be a positive number (got ${gravity})`, { gravity });
  }
}

/**
 * How many times as high the same jump goes, compared with Earth.
 * @param {number} gravity Compared with Earth (Earth = 1).
 * @returns {number}
 * @throws {GameError} 'BAD_GRAVITY'.
 */
export function jumpRatio(gravity) {
  checkGravity(gravity);
  return 1 / gravity;
}

/** @param {number} gravity @returns {number} Seconds one jump lasts. @throws {GameError} 'BAD_GRAVITY'. */
export function jumpSeconds(gravity) {
  checkGravity(gravity);
  return EARTH_JUMP_SECONDS / gravity;
}

/** @param {number} gravity @returns {1|2} How many jumps the astronaut does after landing. @throws {GameError} 'BAD_GRAVITY'. */
export const jumpsFor = (gravity) => (jumpSeconds(gravity) > LONG_JUMP_SECONDS ? 1 : 2);

/** @param {number} gravity @returns {number} Seconds the whole set of jumps lasts. @throws {GameError} 'BAD_GRAVITY'. */
export const jumpTotalSeconds = (gravity) => jumpSeconds(gravity) * jumpsFor(gravity);

/**
 * The top of one jump.
 * @param {number} gravity
 * @param {number} figureHeight The astronaut's height in the scene (it is smaller on tiny bodies).
 * @returns {number} Scene units above the ground.
 * @throws {GameError} 'BAD_GRAVITY'.
 */
export const jumpHeight = (gravity, figureHeight) => EARTH_JUMP_HEIGHTS * figureHeight * jumpRatio(gravity);

/**
 * How high above the ground the astronaut is, `elapsed` seconds after landing: a parabola for each jump, and on the
 * ground once they are done. (A parabola is what a thrown object really follows.)
 *
 * @param {number} gravity
 * @param {number} figureHeight
 * @param {number} elapsed Seconds since the first jump began.
 * @returns {number} 0 on the ground.
 * @throws {GameError} 'BAD_GRAVITY'.
 */
export function jumpOffset(gravity, figureHeight, elapsed) {
  const seconds = jumpSeconds(gravity);
  if (!(elapsed > 0) || elapsed >= seconds * jumpsFor(gravity)) return 0;
  const within = (elapsed % seconds) / seconds;
  return jumpHeight(gravity, figureHeight) * 4 * within * (1 - within);
}

/**
 * The sentence shown (and read out) after the jump, in plain words.
 * @param {{ name: string, gravity: number }} body
 * @returns {string} For example "On Mars the same push lifts you 2.6 times as high as on Earth."
 * @throws {GameError} 'BAD_GRAVITY'.
 */
export function jumpNote(body) {
  const ratio = jumpRatio(body.gravity);
  if (ratio === 1) return 'On Earth the jump is the one you know from home.';
  if (ratio > 1) {
    const times = ratio.toFixed(1);
    // "1.0 times" would read as no change, so a body that pulls only a hair less says "a little higher". Gravity has
    // two decimals at most (the data check), so the nearest to Earth is 0.99, which is 1.01 times, never "100%".
    return Number(times) === 1 ? `On ${body.name} the same push lifts you a little higher than on Earth.` : `On ${body.name} the same push lifts you ${times} times as high as on Earth.`;
  }
  return `On ${body.name} the same push lifts you only ${Math.round(ratio * 100)}% as high as on Earth.`;
}
