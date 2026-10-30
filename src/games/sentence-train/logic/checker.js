import { acceptedOrders } from './sentences.js';

/**
 * @typedef {'order'|'punctuation'|'extra'} MistakeType
 * @typedef {{ ok: true } | { ok: false, reason: 'incomplete' } | { ok: false, reason: 'wrong', firstWrongIndex: number, type: MistakeType }} CheckResult
 */

const END_MARK = /[.?!]$/;

/** Counts the slots where the words differ from an accepted order. */
function mismatches(slotWords, order) {
  return slotWords.reduce((n, w, i) => n + (w === order[i] ? 0 : 1), 0);
}

/**
 * Checks the track against the sentence.
 *
 * - It is right when the words on the track are exactly one of the accepted orders (the main one or a listed
 *   alternative). The extra Hard carriage on the track makes it wrong.
 * - `firstWrongIndex` is the first slot that differs from the accepted order the track is *closest* to, so a child
 *   who built an alternative order is not told off for matching the main one.
 * - The mistake `type`: `extra` if the extra carriage is on the track; `punctuation` if the capital letter or the
 *   full stop / question mark clue was ignored (the first carriage is not capitalised, or the last does not carry the
 *   punctuation); otherwise `order`.
 *
 * @param {readonly (string|null)[]} slotWords The word in each slot, or null for an empty slot.
 * @param {import('./sentences.js').SentenceEntry} entry
 * @returns {CheckResult}
 */
export function check(slotWords, entry) {
  if (slotWords.length !== entry.words.length || slotWords.some((w) => w === null || w === undefined)) {
    return { ok: false, reason: 'incomplete' };
  }
  const orders = acceptedOrders(entry);
  if (orders.some((order) => mismatches(slotWords, order) === 0)) return { ok: true };

  const closest = orders.reduce((best, order) => (mismatches(slotWords, order) < mismatches(slotWords, best) ? order : best), orders[0]);
  const firstWrongIndex = slotWords.findIndex((w, i) => w !== closest[i]);
  const first = slotWords[0];
  const last = slotWords[slotWords.length - 1];
  let type = 'order';
  if (entry.distractor && slotWords.includes(entry.distractor)) type = 'extra';
  else if (first[0] === first[0].toLowerCase() || !END_MARK.test(last)) type = 'punctuation';
  return { ok: false, reason: 'wrong', firstWrongIndex, type };
}
