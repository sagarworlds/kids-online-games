import { GameError } from '../../../engine/utils/errors.js';

/**
 * All money maths is in whole units (rupees): integers only, so there is no rounding to go wrong.
 * @typedef {{ value: number }} HasValue
 */

/** @param {readonly number[]} values @returns {number} */
export function sum(values) {
  return values.reduce((total, value) => {
    if (!Number.isInteger(value) || value < 0) throw new GameError('BAD_MONEY', `${value} is not a whole amount of money`, { value });
    return total + value;
  }, 0);
}

/**
 * The fewest pieces that make `amount`, as a list of values (largest first), or null if it cannot be made.
 *
 * This is the exact answer for *any* set of denominations, not the greedy "largest piece first" shortcut. Greedy
 * happens to be exact for rupees (and dollars), but a currency file can be swapped in without a code change, and for
 * a set like 1, 3, 4 greedy is wrong (6 = 3 + 3, not 4 + 1 + 1). The table is `best[a]` = fewest pieces for amount a.
 *
 * @param {number} amount
 * @param {readonly HasValue[]} denominations
 * @returns {number[]|null}
 */
export function minBreakdown(amount, denominations) {
  if (!Number.isInteger(amount) || amount < 0) throw new GameError('BAD_MONEY', `${amount} is not a whole amount of money`, { amount });
  const values = [...new Set(denominations.map((d) => d.value))].filter((v) => v > 0).sort((a, b) => a - b);
  const best = new Array(amount + 1).fill(Infinity);
  const last = new Array(amount + 1).fill(0);
  best[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const v of values) {
      if (v > a) break;
      if (best[a - v] + 1 < best[a]) {
        best[a] = best[a - v] + 1;
        last[a] = v;
      }
    }
  }
  if (best[amount] === Infinity) return null;
  const pieces = [];
  for (let a = amount; a > 0; a -= last[a]) pieces.push(last[a]);
  return pieces.sort((x, y) => y - x);
}

/**
 * @param {number} amount
 * @param {readonly HasValue[]} denominations
 * @returns {number|null} The fewest pieces needed, or null if the amount cannot be made.
 */
export function minPieces(amount, denominations) {
  return minBreakdown(amount, denominations)?.length ?? null;
}

/**
 * @typedef {{ kind: 'empty'|'exact'|'tooMuch'|'tooLittle', given: number, diff: number, smart: boolean, pieces: number, fewest: number|null }} ChangeCheck
 * `diff` is how far off the tray is (always 0 or more); `smart` is true for exact change in the fewest pieces.
 */

/**
 * Checks the tray against the change that is due: right when the tray total equals payment minus bill.
 * An empty tray is its own answer, `empty`, so a customer owed nothing is not served by "doing nothing": the child
 * has to say "No change needed" on purpose.
 *
 * @param {{ changeDue: number }} sale
 * @param {readonly number[]} trayValues Value of each piece in the tray.
 * @param {readonly HasValue[]} denominations Used for the fewest-pieces comparison.
 * @returns {ChangeCheck}
 */
export function checkChange(sale, trayValues, denominations) {
  const given = sum(trayValues);
  const fewest = minPieces(sale.changeDue, denominations);
  const base = { given, pieces: trayValues.length, fewest };
  if (trayValues.length === 0) return { ...base, kind: 'empty', diff: sale.changeDue, smart: false };
  if (given === sale.changeDue) return { ...base, kind: 'exact', diff: 0, smart: trayValues.length === fewest };
  return given > sale.changeDue
    ? { ...base, kind: 'tooMuch', diff: given - sale.changeDue, smart: false }
    : { ...base, kind: 'tooLittle', diff: sale.changeDue - given, smart: false };
}
