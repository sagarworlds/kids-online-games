import { EXPLORED_AT } from './levels.js';
import { CONTINENT_IDS } from './continents.js';

/**
 * @typedef {Record<string, { correct: number, explored: boolean }>} Progress  By country code.
 * Only countries that have been answered right at least once have an entry.
 */

/**
 * A correct answer about a country. It counts towards exploring it; after EXPLORED_AT right answers the country is
 * explored (coloured in on the map, and stamped in the passport). Wrong answers never change progress.
 *
 * @param {Progress} progress
 * @param {string} code
 * @returns {Progress} A new object.
 */
export function recordCorrect(progress, code) {
  const correct = (progress[code]?.correct ?? 0) + 1;
  return { ...progress, [code]: { correct, explored: correct >= EXPLORED_AT } };
}

/** @param {Progress} progress @param {string} code @returns {boolean} */
export const isExplored = (progress, code) => progress[code]?.explored === true;

/** @param {Progress} progress @returns {Set<string>} The codes of every explored country. */
export const exploredCodes = (progress) => new Set(Object.keys(progress).filter((code) => progress[code].explored));

/**
 * Countries that became explored between two states of the progress (the new passport stamps of a trip).
 * @param {Progress} before
 * @param {Progress} after
 * @returns {string[]}
 */
export const newlyExplored = (before, after) => Object.keys(after).filter((code) => after[code].explored && !before[code]?.explored);

/**
 * How much of each continent, and of the world, is explored. Every country counts, whatever its level.
 * @param {Progress} progress
 * @param {readonly { code: string, continent: string }[]} countries
 * @returns {{ world: { explored: number, total: number, percent: number }, continents: Record<string, { explored: number, total: number, percent: number }> }}
 */
export function summarize(progress, countries) {
  const tally = (list) => {
    const explored = list.filter((c) => isExplored(progress, c.code)).length;
    return { explored, total: list.length, percent: list.length ? Math.round((explored / list.length) * 100) : 0 };
  };
  return {
    world: tally(countries),
    continents: Object.fromEntries(CONTINENT_IDS.map((id) => [id, tally(countries.filter((c) => c.continent === id))])),
  };
}

/**
 * Cleans progress read from storage, which could have been edited or damaged: only known countries with whole,
 * sensible counts are kept, and `explored` is recomputed rather than trusted.
 * @param {unknown} raw
 * @param {ReadonlySet<string>} validCodes
 * @returns {Progress}
 */
export function sanitizeProgress(raw, validCodes) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const [code, entry] of Object.entries(raw)) {
    const correct = entry?.correct;
    if (validCodes.has(code) && Number.isInteger(correct) && correct >= 1 && correct <= 1000) {
      clean[code] = { correct, explored: correct >= EXPLORED_AT };
    }
  }
  return clean;
}
