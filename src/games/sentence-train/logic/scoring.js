import { THREE_STARS_AT, TWO_STARS_AT } from './levels.js';

/** @typedef {'first'|'retry'|'failed'} SentenceStatus */

/**
 * Stars from the sentences built right on the first whistle: 7 or more = 3, 5 or more = 2, otherwise 1.
 * @param {readonly { status: SentenceStatus }[]} results
 * @returns {1|2|3}
 */
export function roundStars(results) {
  const firstTry = results.filter((r) => r.status === 'first').length;
  if (firstTry >= THREE_STARS_AT) return 3;
  if (firstTry >= TWO_STARS_AT) return 2;
  return 1;
}

/**
 * Adds up the mistakes of every sentence by kind.
 * @param {readonly { mistakes: { order: number, punctuation: number, extra: number } }[]} results
 * @returns {{ order: number, punctuation: number, extra: number }}
 */
export function mistakeTotals(results) {
  return results.reduce(
    (total, r) => ({ order: total.order + r.mistakes.order, punctuation: total.punctuation + r.mistakes.punctuation, extra: total.extra + r.mistakes.extra }),
    { order: 0, punctuation: 0, extra: 0 },
  );
}

/** Score kept for "best": 10 for a sentence right first time, 5 after a retry. */
export const roundScore = (results) => results.reduce((sum, r) => sum + { first: 10, retry: 5, failed: 0 }[r.status], 0);
