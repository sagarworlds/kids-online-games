import { GameError } from '../../../engine/utils/errors.js';

/**
 * Lights Out solver using linear algebra over GF(2) (arithmetic where 1 + 1 = 0).
 *
 * The idea: a tap is a *vector* with a 1 in every jar it flips. Doing a tap twice cancels out and the order never
 * matters, so the final board is just the XOR (addition mod 2) of the taps you used. To switch a board off we need
 * a set of taps whose XOR equals the board. That is a system of equations
 *
 *     A * x = b      (A: one column per tap, x: which taps we use, b: the lit jars)
 *
 * which Gaussian elimination solves with XOR as "add". Many boards have several solutions (they differ by a "null
 * pattern": taps that change nothing). We enumerate them all and return the one with the fewest taps.
 */

/** Sizes above this would have too many null patterns to enumerate (9x9 already has 2^8). */
export const MAX_SIZE = 10;

/**
 * @param {boolean[][]} board
 * @returns {[number, number][]|null} A smallest set of taps that switches every jar off, or null if the board
 *   cannot be solved (some large boards can't). An already-dark board returns [].
 * @throws {GameError} 'BAD_SIZE' for a non-square board or one larger than {@link MAX_SIZE}.
 */
export function solve(board) {
  const n = board.length;
  if (n === 0 || n > MAX_SIZE || board.some((row) => row.length !== n)) {
    throw new GameError('BAD_SIZE', `solve needs a square board of 1..${MAX_SIZE}`, { size: n });
  }
  const cells = n * n;

  // Row i is the equation for jar i: sum of the taps that flip it = 1 if it is lit, else 0. The last column is b.
  const rows = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const row = new Uint8Array(cells + 1);
      for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n) row[rr * n + cc] = 1;
      }
      row[cells] = board[r][c] ? 1 : 0;
      rows.push(row);
    }
  }

  // Gaussian elimination to reduced row echelon form. "Subtracting" a row is XOR-ing it in.
  const pivotOfRow = [];
  let rank = 0;
  for (let col = 0; col < cells && rank < cells; col++) {
    let pivot = -1;
    for (let i = rank; i < cells; i++) {
      if (rows[i][col]) { pivot = i; break; }
    }
    if (pivot === -1) continue; // a free column: this tap is not forced by the others
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let i = 0; i < cells; i++) {
      if (i !== rank && rows[i][col]) for (let k = col; k <= cells; k++) rows[i][k] ^= rows[rank][k];
    }
    pivotOfRow[rank] = col;
    rank += 1;
  }

  // A leftover row "0 = 1" means the lit pattern is impossible to clear.
  for (let i = rank; i < cells; i++) if (rows[i][cells]) return null;

  // One solution: free taps unused (0), every pivot tap set by its row's right-hand side.
  const pivotCols = new Set(pivotOfRow);
  const particular = new Uint8Array(cells);
  for (let i = 0; i < rank; i++) particular[pivotOfRow[i]] = rows[i][cells];

  // Each free column gives a "null pattern": taps that together change nothing. Adding any combination of them to a
  // solution gives another solution, so trying every combination finds the smallest.
  const free = [];
  for (let col = 0; col < cells; col++) if (!pivotCols.has(col)) free.push(col);
  const nullPatterns = free.map((f) => {
    const v = new Uint8Array(cells);
    v[f] = 1;
    for (let i = 0; i < rank; i++) v[pivotOfRow[i]] = rows[i][f];
    return v;
  });

  let best = null;
  let bestWeight = Infinity;
  for (let mask = 0; mask < 1 << nullPatterns.length; mask++) {
    const candidate = particular.slice();
    for (let k = 0; k < nullPatterns.length; k++) {
      if (mask & (1 << k)) for (let i = 0; i < cells; i++) candidate[i] ^= nullPatterns[k][i];
    }
    let weight = 0;
    for (let i = 0; i < cells; i++) weight += candidate[i];
    if (weight < bestWeight) { best = candidate; bestWeight = weight; }
  }

  const taps = [];
  for (let i = 0; i < cells; i++) if (best[i]) taps.push([Math.floor(i / n), i % n]);
  return taps;
}
