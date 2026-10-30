import { THREE_STARS_AT, TWO_STARS_AT } from './levels.js';

/** The detective ranks, one per star count. */
export const RANKS = Object.freeze({ 1: 'Rookie', 2: 'Sleuth', 3: 'Master' });

/**
 * Stars from the cases solved with the first pick: 9 or more = 3, 6 or more = 2, otherwise 1.
 * @param {readonly { firstTry: boolean }[]} results
 * @returns {1|2|3}
 */
export function roundStars(results) {
  const firstTry = results.filter((r) => r.firstTry).length;
  if (firstTry >= THREE_STARS_AT) return 3;
  if (firstTry >= TWO_STARS_AT) return 2;
  return 1;
}

/** @param {1|2|3} stars @returns {'Rookie'|'Sleuth'|'Master'} The detective rank for the stars earned. */
export const rankFor = (stars) => RANKS[stars];

/** Score kept for "best": 10 for a case solved with the first pick, 5 for one needing more. */
export const roundScore = (results) => results.reduce((sum, r) => sum + (r.firstTry ? 10 : 5), 0);
