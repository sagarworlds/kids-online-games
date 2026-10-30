import { GameError } from '../../../engine/utils/errors.js';

/** @typedef {boolean[][]} Board  `true` = lit (a firefly in the jar). Indexed as board[row][column]. */

/** @param {number} size @returns {Board} An all-off board. */
export function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

/**
 * Tapping a jar flips it and its up, down, left and right neighbours. Corner and edge jars flip only the
 * neighbours that exist. Returns a new board (the input is never changed), which makes undo and the solver simple.
 *
 * @param {Board} board
 * @param {number} r Row, from 0.
 * @param {number} c Column, from 0.
 * @returns {Board}
 * @throws {GameError} 'OUT_OF_BOARD' if (r, c) is not on the board.
 */
export function toggle(board, r, c) {
  const size = board.length;
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= size || c >= size) {
    throw new GameError('OUT_OF_BOARD', `(${r}, ${c}) is not on a ${size}x${size} board`, { r, c, size });
  }
  const next = board.map((row) => row.slice());
  for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < size && cc < size) next[rr][cc] = !next[rr][cc];
  }
  return next;
}

/** @param {Board} board @returns {boolean} True when every jar is dark (all fireflies are free). */
export function isSolved(board) {
  return board.every((row) => row.every((lit) => !lit));
}

/** @param {Board} board @returns {number} How many jars are lit. */
export function countLit(board) {
  return board.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
}

/**
 * The board you get by tapping the given jars on an all-off board.
 * @param {number} size
 * @param {readonly (readonly [number, number])[]} taps
 * @returns {Board}
 */
export function boardFromTaps(size, taps) {
  return taps.reduce((board, [r, c]) => toggle(board, r, c), createBoard(size));
}
