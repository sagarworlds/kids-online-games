import { GameError } from '../../../engine/utils/errors.js';
import { acceptedOrders } from './sentences.js';

/**
 * @typedef {{ id: number, word: string }} Carriage
 * @typedef {{
 *   carriages: readonly Carriage[], slots: readonly (number|null)[], locked: readonly boolean[]
 * }} Board
 * `slots[i]` is the id of the carriage in slot i (or null). A locked slot was filled by a hint and cannot be changed.
 * Carriages that are in no slot are on the siding, in their original scrambled order.
 */

const slotOf = (board, id) => board.slots.indexOf(id);
const byId = (board, id) => board.carriages.find((c) => c.id === id);

/**
 * A fresh board: every carriage on the siding, one empty slot per word of the sentence (so on Hard there is one more
 * carriage than slots, and the extra one has to stay on the siding).
 * @param {readonly Carriage[]} carriages
 * @param {number} slotCount
 * @returns {Board}
 */
export function newBoard(carriages, slotCount) {
  return Object.freeze({ carriages, slots: Object.freeze(Array(slotCount).fill(null)), locked: Object.freeze(Array(slotCount).fill(false)) });
}

function withSlots(board, slots) {
  return Object.freeze({ ...board, slots: Object.freeze(slots) });
}

function assertCarriage(board, id) {
  if (!byId(board, id)) throw new GameError('NO_SUCH_CARRIAGE', `There is no carriage ${id}`, { id });
}

function assertSlot(board, index) {
  if (!Number.isInteger(index) || index < 0 || index >= board.slots.length) {
    throw new GameError('NO_SUCH_SLOT', `There is no slot ${index}`, { index });
  }
}

/** @param {Board} board @returns {Carriage[]} Carriages on the siding, in their original order. */
export const sidingCarriages = (board) => board.carriages.filter((c) => !board.slots.includes(c.id));

/** @param {Board} board @returns {(string|null)[]} The word in each slot. */
export const slotWords = (board) => board.slots.map((id) => (id === null ? null : byId(board, id).word));

/** @param {Board} board @returns {boolean} Every slot has a carriage (the whistle works). */
export const isFull = (board) => board.slots.every((id) => id !== null);

/**
 * Drops a carriage on a slot.
 * - From the siding onto an empty slot: it goes in.
 * - From the siding onto a full slot: it takes the place and the carriage that was there goes back to the siding.
 * - From another slot onto an empty slot: it moves.
 * - From another slot onto a full slot: the two swap.
 * A locked slot refuses (and the carriage stays where it was), and so does a carriage in a locked slot.
 *
 * @param {Board} board
 * @param {number} id
 * @param {number} slot
 * @returns {Board} The same board when the move is refused.
 * @throws {GameError} 'NO_SUCH_CARRIAGE' or 'NO_SUCH_SLOT'
 */
export function place(board, id, slot) {
  assertCarriage(board, id);
  assertSlot(board, slot);
  const from = slotOf(board, id);
  if (board.locked[slot] || (from >= 0 && board.locked[from]) || from === slot) return board;
  const slots = [...board.slots];
  const displaced = slots[slot];
  slots[slot] = id;
  if (from >= 0) slots[from] = displaced; // a swap; a null displaced simply empties the old slot
  return withSlots(board, slots);
}

/**
 * Sends a carriage on the track back to the siding. Nothing happens for one already on the siding or in a locked slot.
 * @param {Board} board
 * @param {number} id
 * @returns {Board}
 * @throws {GameError} 'NO_SUCH_CARRIAGE'
 */
export function remove(board, id) {
  assertCarriage(board, id);
  const from = slotOf(board, id);
  if (from < 0 || board.locked[from]) return board;
  const slots = [...board.slots];
  slots[from] = null;
  return withSlots(board, slots);
}

/**
 * Puts a siding carriage in the leftmost slot that is empty and not locked (the keyboard route).
 * @param {Board} board
 * @param {number} id
 * @returns {Board}
 */
export function placeInFirstEmpty(board, id) {
  assertCarriage(board, id);
  if (slotOf(board, id) >= 0) return board;
  const slot = board.slots.findIndex((c, i) => c === null && !board.locked[i]);
  return slot < 0 ? board : place(board, id, slot);
}

/**
 * Moves a carriage on the track one slot left or right, swapping with whatever is there (the keyboard route to
 * re-ordering). Refused at the ends of the track and for locked slots.
 * @param {Board} board
 * @param {number} id
 * @param {-1|1} direction
 * @returns {Board}
 */
export function nudge(board, id, direction) {
  assertCarriage(board, id);
  const from = slotOf(board, id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= board.slots.length) return board;
  return place(board, id, to);
}

/**
 * The hint: locks the next correct carriage into place. Of the accepted orders it follows the one the track already
 * matches best, finds the leftmost slot that is empty or wrong, and puts the right carriage there from the siding (or
 * from elsewhere on the track), then locks the slot. The extra Hard carriage is never used.
 *
 * @param {Board} board
 * @param {import('./sentences.js').SentenceEntry} entry
 * @returns {{ board: Board, slot: number }|null} null when every slot is already right.
 */
export function hintNext(board, entry) {
  const words = slotWords(board);
  const target = acceptedOrders(entry).reduce((best, order) => {
    const score = (o) => words.filter((w, i) => w === o[i]).length;
    return score(order) > score(best) ? order : best;
  });
  const slot = target.findIndex((w, i) => words[i] !== w);
  if (slot < 0) return null;
  // Take a carriage with the right word that is not already locked in place: from the siding first, else the track.
  const spare = (c) => c.word === target[slot] && !board.locked[slotOf(board, c.id)];
  const carriage = sidingCarriages(board).find(spare) ?? board.carriages.find((c) => spare(c) && slotOf(board, c.id) !== slot);
  if (!carriage) return null;
  // A wrong slot is never locked (hints only lock correct slots), so the move is allowed.
  const moved = place(board, carriage.id, slot);
  const locked = moved.locked.map((l, i) => (i === slot ? true : l));
  return { board: Object.freeze({ ...moved, locked: Object.freeze(locked) }), slot };
}

/**
 * Arranges the carriages in the first accepted order and locks nothing: used to show the answer after too many tries.
 * @param {Board} board
 * @param {import('./sentences.js').SentenceEntry} entry
 * @returns {Board}
 */
export function solved(board, entry) {
  const target = entry.words;
  const used = new Set();
  const slots = target.map((word) => {
    const carriage = board.carriages.find((c) => c.word === word && !used.has(c.id));
    used.add(carriage.id);
    return carriage.id;
  });
  return Object.freeze({ ...board, slots: Object.freeze(slots), locked: Object.freeze(slots.map(() => true)) });
}
