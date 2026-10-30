/** A race within this long of the ghost's time still earns 2 stars. */
export const CLOSE_MS = 5000;

/**
 * Stars by time against the ghost: beat it = 3, finish within 5 s behind = 2, otherwise 1 (finishing always counts).
 * @param {number} finishMs
 * @param {number} ghostFinishMs
 * @returns {1|2|3}
 */
export function starsForRace(finishMs, ghostFinishMs) {
  if (finishMs < ghostFinishMs) return 3;
  if (finishMs <= ghostFinishMs + CLOSE_MS) return 2;
  return 1;
}

/**
 * @param {number} finishMs
 * @param {number} ghostFinishMs
 * @returns {number} Milliseconds ahead (negative) or behind (positive) the ghost.
 */
export const ghostDifference = (finishMs, ghostFinishMs) => finishMs - ghostFinishMs;

/** @param {number} ms @returns {string} Minutes, seconds and tenths: 72340 -> "1:12.3". */
export function formatTime(ms) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}

/** @param {number} ms @returns {string} e.g. "2.4 s". */
export const formatSeconds = (ms) => `${(Math.abs(ms) / 1000).toFixed(1)} s`;

/**
 * How well a table went, as a label for the heat strip. The label is text as well as colour, so it never depends on
 * colour alone.
 * @param {{ asked: number, correct: number }} stats
 * @returns {'strong'|'ok'|'practise'}
 */
export function heatFor({ asked, correct }) {
  const accuracy = asked === 0 ? 0 : correct / asked;
  if (accuracy >= 0.9) return 'strong';
  if (accuracy >= 0.7) return 'ok';
  return 'practise';
}

/** Score kept for "best": a point for each fact answered right first time. */
export const raceScore = (firstTry) => firstTry * 10;
