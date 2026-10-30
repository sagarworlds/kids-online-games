import { GameError } from '../../../engine/utils/errors.js';

/** @typedef {(string|null)[]} PizzaState  The topping on each slice (null = bare), indexed clockwise from the top. */

/** @param {number} slices @returns {PizzaState} */
export function emptyPizza(slices) {
  return Array(slices).fill(null);
}

/**
 * Tapping a slice toggles the selected topping on it: a bare slice gets the topping, a slice that already has it
 * goes bare, and a slice with a *different* topping switches to the selected one (one topping per slice).
 * Returns a new pizza.
 *
 * @param {PizzaState} pizza
 * @param {number} index
 * @param {string} topping
 * @returns {PizzaState}
 * @throws {GameError} 'NO_SUCH_SLICE'
 */
export function toggleSlice(pizza, index, topping) {
  if (!Number.isInteger(index) || index < 0 || index >= pizza.length) {
    throw new GameError('NO_SUCH_SLICE', `There is no slice ${index} on a ${pizza.length}-slice pizza`, { index });
  }
  const next = pizza.slice();
  next[index] = pizza[index] === topping ? null : topping;
  return next;
}

/** @param {PizzaState} pizza @returns {boolean} */
export const isEmpty = (pizza) => pizza.every((t) => t === null);

/** @param {PizzaState} pizza @param {string} topping @returns {number} */
export const countTopping = (pizza, topping) => pizza.filter((t) => t === topping).length;

/**
 * Which slice a tap landed on, found from the angle around the centre. Slice 0 starts at the top (12 o'clock) and
 * slices run clockwise. A tap exactly on a border belongs to the slice that *starts* there (rounded down).
 *
 * @param {number} x Tap position.
 * @param {number} y
 * @param {{ cx: number, cy: number, radius: number }} circle The pizza on screen.
 * @param {number} slices
 * @returns {number|null} The slice index, or null for a tap outside the pizza.
 */
export function sliceAtPoint(x, y, { cx, cy, radius }, slices) {
  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.hypot(dx, dy);
  if (distance > radius) return null;
  // The exact centre has no angle (atan2(0, 0) would read as "3 o'clock"), so pick slice 0 instead of an accident.
  if (distance === 0) return 0;
  const fromTop = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI); // clockwise from 12 o'clock
  return Math.min(slices - 1, Math.floor(fromTop / ((2 * Math.PI) / slices)));
}
