import { GameError } from '../../../engine/utils/errors.js';

/**
 * How the 3D toy-train yard is laid out and how it moves: pure numbers, so the layout, the camera and the little animations can be tested without a
 * screen. The train is the engine and then one place for each word of the sentence, running from left to right; on a narrow picture it runs on in
 * further rows (as parallel tracks), so every carriage is big enough to read.
 */

/** A carriage's length and the gap between carriages (one pitch from a carriage to the next), the room between two rows of track, and the heights. */
export const CARRIAGE_LENGTH = 2.8;
export const CARRIAGE_GAP = 0.5;
export const ROW_SPACING = 3.7;
export const CARRIAGE_HEIGHT = 1.35;
const PITCH = CARRIAGE_LENGTH + CARRIAGE_GAP;

const assertCount = (count) => {
  if (!Number.isInteger(count) || count < 2) throw new GameError('BAD_TRAIN_LENGTH', `A train is the engine and at least one carriage, so at least 2 places, not ${count}`, { count });
};

/**
 * How many places (the engine counts as one) go in each row of track, for a picture of this shape. Rows are kept even, so the last one is not left with a
 * single carriage on its own.
 * @param {number} count Places in all, the engine included.
 * @param {number} aspect Width over height of the picture.
 * @returns {{ perRow: number, rows: number }}
 */
export function rowsFor(count, aspect) {
  assertCount(count);
  const widest = aspect >= 1.9 ? 12 : aspect >= 1.5 ? 8 : aspect >= 1.25 ? 5 : 4;
  const rows = Math.ceil(count / widest);
  return { perRow: Math.ceil(count / rows), rows };
}

/**
 * Where a place stands. Place 0 is the engine and place `i` is the carriage for the slot `i - 1`. The first row is at the back and each row is a track a
 * little nearer, the whole yard centred on the origin.
 * @param {number} place
 * @param {number} count Places in all, the engine included.
 * @param {number} aspect
 * @returns {{ x: number, z: number, row: number, col: number }}
 * @throws {GameError} 'BAD_TRAIN_LENGTH' / 'NO_SUCH_PLACE'
 */
export function placePosition(place, count, aspect) {
  assertCount(count);
  if (!Number.isInteger(place) || place < 0 || place >= count) throw new GameError('NO_SUCH_PLACE', `There is no place ${place} in a train of ${count}`, { place, count });
  const { perRow, rows } = rowsFor(count, aspect);
  const row = Math.floor(place / perRow);
  const col = place % perRow;
  return { x: (col - (perRow - 1) / 2) * PITCH, z: (row - (rows - 1) / 2) * ROW_SPACING, row, col };
}

/**
 * The first view of the yard: from the front and above, far enough back that the widest row and every row's depth fit the picture at its shape.
 * @param {number} count
 * @param {number} aspect
 * @returns {{ distance: number, polar: number, target: { x: number, y: number, z: number } }}
 */
export function startView(count, aspect) {
  assertCount(count);
  const { perRow, rows } = rowsFor(count, aspect);
  const width = perRow * PITCH + 1.4; // the rows nearer the camera look a little wider than the middle one, so there is some room to spare
  const depth = (rows - 1) * ROW_SPACING + 3.6;
  const half = 2 * Math.tan((35 * Math.PI) / 360);
  const fitWidth = width / (half * Math.max(0.5, aspect));
  const fitDepth = (depth * 1.05 + 1.5) / half;
  return { distance: Math.max(11, fitWidth * 1.08, fitDepth), polar: 0.98, target: { x: 0, y: 0.5, z: 0 } };
}

/** How long the train takes to leave the station, in seconds (the flat game's `train-leave` animation takes the same). */
export const LEAVE_SECONDS = 1.8;
const JOLT_AT = 0.15;
const JOLT = 0.5;
const TRAVEL = 55;

/**
 * How far the train has moved along the track `age` seconds after it was sent: a small jolt backwards first, as the carriages take up the slack, then it
 * speeds up and rolls away, ending well out of the picture.
 * @param {number} age
 * @returns {number} World units; negative for the jolt.
 */
export function trainOffset(age) {
  const f = Math.min(1, Math.max(0, age / LEAVE_SECONDS));
  if (f <= JOLT_AT) return 0 - JOLT * (f / JOLT_AT); // (written as 0 - x so that the start is a plain 0, not -0)
  const t = (f - JOLT_AT) / (1 - JOLT_AT);
  return -JOLT + (TRAVEL + JOLT) * t * t * t; // slow at first, quicker and quicker
}

/**
 * How far a carriage in the wrong place bounces, `age` seconds after it was marked: up and down twice, like the flat carriage's bounce.
 * @param {number} age
 * @returns {number} Height above the track.
 */
export function wrongBounce(age) {
  if (!(age > 0) || age >= 1) return 0;
  return Math.abs(Math.sin(age * Math.PI * 2)) * 0.5 * (1 - age * 0.4);
}

/** How long a carriage takes to settle on the track when it is put in a slot, and how high it starts. */
export const DROP_SECONDS = 0.25;
const DROP_FROM = 2.2;

/**
 * The height of a carriage as it is lowered onto the track from above: it falls and lands exactly on the rails.
 * @param {number} age Seconds since it was put in the slot.
 * @returns {number}
 */
export function dropHeight(age) {
  if (!(age >= 0)) return DROP_FROM;
  if (age >= DROP_SECONDS) return 0;
  const t = age / DROP_SECONDS;
  return DROP_FROM * (1 - t * t);
}

/**
 * A puff of steam from the chimney: it rises, grows and fades.
 * @param {number} age Seconds since the puff began.
 * @returns {{ rise: number, scale: number, opacity: number }}
 */
export function steamPuff(age) {
  const t = Math.min(1, Math.max(0, age / 1.4));
  return { rise: 2.6 * t, scale: 0.35 + 0.9 * t, opacity: 0.85 * (1 - t) };
}

/**
 * How big to write a word on a carriage so that it fits, never below a minimum (a long word is shown a little smaller, and the picture stays readable).
 * @param {number} naturalWidth How wide the word is at `size`.
 * @param {number} size The size it was measured at.
 * @param {number} maxWidth The most room there is.
 * @param {number} [min]
 * @returns {number}
 */
export function fitFontSize(naturalWidth, size, maxWidth, min = 26) {
  if (!(naturalWidth > 0)) return size;
  return Math.max(min, Math.min(size, size * (maxWidth / naturalWidth)));
}
