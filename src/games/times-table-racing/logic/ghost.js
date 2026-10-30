import { RACE_LENGTH } from './levels.js';

/**
 * @typedef {{ table: string, times: number[] }} GhostRun
 * `times[i]` is how many milliseconds after the start the (i + 1)th correct answer was given.
 */

/**
 * The ghost used until the child has a best run: one answer every `paceMs`.
 * @param {number} paceMs
 * @param {string} table
 * @param {number} [length]
 * @returns {GhostRun}
 */
export function defaultGhost(paceMs, table, length = RACE_LENGTH) {
  return { table, times: Array.from({ length }, (_, i) => (i + 1) * paceMs) };
}

/**
 * Checks a saved ghost, which could have been damaged or edited.
 * @param {unknown} run
 * @param {number} [length]
 * @returns {GhostRun|null} The run if it is usable (right number of answers, none negative, never going back in
 *   time), otherwise null.
 */
export function validateGhost(run, length = RACE_LENGTH) {
  if (!run || typeof run !== 'object' || typeof run.table !== 'string' || !Array.isArray(run.times)) return null;
  if (run.times.length !== length) return null;
  for (let i = 0; i < run.times.length; i++) {
    const t = run.times[i];
    if (!Number.isFinite(t) || t < 0 || (i > 0 && t < run.times[i - 1])) return null;
  }
  return run;
}

/**
 * How far along the track the ghost is, from 0 to 1, `elapsedMs` after the start: one 1/20 step at each saved time,
 * so it replays the best run to the millisecond.
 * @param {GhostRun} run
 * @param {number} elapsedMs
 * @returns {number}
 */
export function ghostProgressAt(run, elapsedMs) {
  let done = 0;
  for (const t of run.times) {
    if (t <= elapsedMs) done += 1;
    else break;
  }
  return done / run.times.length;
}

/** @param {GhostRun} run @returns {number} When the ghost crosses the finish line. */
export const ghostFinishMs = (run) => run.times[run.times.length - 1];
