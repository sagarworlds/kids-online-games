/** Longest answer is 3 digits (up to 500) but 4 leaves room for typos like 1000. */
export const MAX_DIGITS = 4;

/**
 * Adds a typed digit to the answer buffer.
 * - Non-digits are ignored.
 * - Leading zeros are ignored: a lone "0" is a valid answer (5 - 5), but typing
 *   more zeros keeps it "0", and typing 7 after "0" gives "7", not "07".
 * - Input stops growing at {@link MAX_DIGITS}.
 *
 * @param {string} buffer Current text, digits only.
 * @param {string} digit One typed character.
 * @returns {string} The new buffer.
 */
export function appendDigit(buffer, digit) {
  if (!/^[0-9]$/.test(digit)) return buffer;
  if (buffer === '0') return digit; // "0" + "0" stays "0"; "0" + "7" becomes "7"
  if (buffer.length >= MAX_DIGITS) return buffer;
  return buffer + digit;
}

/**
 * @param {string} buffer
 * @returns {string} The buffer without its last digit.
 */
export function backspace(buffer) {
  return buffer.slice(0, -1);
}

/**
 * @param {string} buffer
 * @returns {number|null} The typed number, or null for empty input (Enter on an empty box does nothing).
 */
export function parseAnswer(buffer) {
  return buffer === '' ? null : Number(buffer);
}
