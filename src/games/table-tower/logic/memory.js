import { parseFactKey } from './facts.js';

/**
 * What the game remembers about each fact, so facts that are hard come back sooner and more often.
 *
 * Each fact sits in a box from 0 to 5. A right answer moves it up a box and a wrong one drops it to box 0. A fact in a
 * higher box is due again later (BOX_DAYS), so learned facts fade from revision and missed ones return the next time.
 *
 * @typedef {{ box: number, seen: number, right: number, due: number }} FactRecord
 * `due` is the day number (see `dayNumber`) it is next due.
 * @typedef {Record<string, FactRecord>} Memory
 */

export const MAX_BOX = 5;
/** Days until a fact is due again, by box. */
export const BOX_DAYS = Object.freeze([0, 1, 3, 7, 14, 30]);
/** How much more likely a fact that was never asked is to come up than a mastered one (weight 1). */
export const UNSEEN_WEIGHT = 4;

/**
 * A whole number for a calendar day in the player's own time zone, so "tomorrow" starts at their midnight.
 * @param {Date} date
 * @returns {number}
 */
export const dayNumber = (date) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);

/** @param {unknown} r @returns {r is FactRecord} */
const isRecord = (r) => Boolean(r) && typeof r === 'object'
  && Number.isInteger(r.box) && r.box >= 0 && r.box <= MAX_BOX
  && Number.isInteger(r.seen) && r.seen >= 0 && Number.isInteger(r.right) && r.right >= 0 && r.right <= r.seen
  && Number.isInteger(r.due) && r.due >= 0;

/**
 * Cleans what was saved: damaged entries are dropped one by one (and named in the log) instead of losing everything.
 * @param {unknown} raw
 * @param {{ error: (...args: unknown[]) => void }} [logger]
 * @returns {Memory}
 */
export function sanitizeMemory(raw, logger = console) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    logger.error('[table-tower] saved fact memory is damaged; starting it again', raw);
    return {};
  }
  const clean = {};
  for (const [key, record] of Object.entries(raw)) {
    let valid = isRecord(record);
    if (valid) {
      try { parseFactKey(key); } catch (error) { if (error?.code !== 'BAD_FACT') throw error; valid = false; }
    }
    if (valid) clean[key] = { box: record.box, seen: record.seen, right: record.right, due: record.due };
    else logger.error(`[table-tower] ignoring damaged memory for "${key}"`, record);
  }
  return clean;
}

/**
 * The record after an answer.
 * @param {FactRecord|undefined} record
 * @param {boolean} correct
 * @param {number} today
 * @returns {FactRecord}
 */
export function recordAnswer(record, correct, today) {
  const before = record ?? { box: 0, seen: 0, right: 0, due: today };
  const box = correct ? Math.min(MAX_BOX, before.box + 1) : 0;
  return { box, seen: before.seen + 1, right: before.right + (correct ? 1 : 0), due: today + BOX_DAYS[box] };
}

/**
 * Applies the first answer to each fact in a session. Returns a new memory and leaves the old one alone.
 * @param {Memory} memory
 * @param {readonly { key: string, correct: boolean }[]} results
 * @param {number} today
 * @returns {Memory}
 */
export function applyResults(memory, results, today) {
  const next = { ...memory };
  for (const { key, correct } of results) next[key] = recordAnswer(next[key], correct, today);
  return next;
}

/** @param {FactRecord|undefined} record @param {number} today @returns {boolean} Seen before and due today or earlier. */
export const isDue = (record, today) => record !== undefined && record.due <= today;

/**
 * How likely a fact is to be picked: a never-seen fact 4, and a seen one from 11 (box 0, just missed) down to 1 (box 5).
 * @param {FactRecord|undefined} record
 * @returns {number}
 */
export const weightOf = (record) => (record === undefined ? UNSEEN_WEIGHT : 1 + 2 * (MAX_BOX - record.box));

/**
 * The facts due today, the weakest first (lowest box, then the longest overdue).
 * @param {Memory} memory
 * @param {number} today
 * @returns {string[]} Fact keys.
 */
export function dueKeys(memory, today) {
  return Object.entries(memory)
    .filter(([, record]) => isDue(record, today))
    .sort(([ka, a], [kb, b]) => a.box - b.box || a.due - b.due || ka.localeCompare(kb, 'en', { numeric: true }))
    .map(([key]) => key);
}
