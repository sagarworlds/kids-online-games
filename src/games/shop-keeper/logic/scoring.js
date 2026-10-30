import { starsForAccuracy } from '../../../engine/utils/stars.js';

/** @typedef {'first'|'retry'|'failed'} SaleStatus */

export const POINTS = Object.freeze({ first: 10, retry: 5, failed: 0 });
/** Extra points for giving exact change in the fewest possible pieces. */
export const SMART_POINTS = 5;
/** This many "Smart change" sales in a round earns a bonus star. */
export const SMART_STAR_THRESHOLD = 5;

/**
 * @param {SaleStatus} status
 * @param {boolean} smart
 * @returns {number}
 */
export const saleScore = (status, smart) => POINTS[status] + (smart ? SMART_POINTS : 0);

/**
 * Stars: accuracy first (a sale with no mistakes counts 1, one that needed a retry counts half, one where the answer
 * had to be shown counts 0), then the "Smart change" bonus star when `SMART_STAR_THRESHOLD` or more sales used the
 * fewest pieces. The bonus cannot go past 3 stars.
 *
 * @param {readonly SaleStatus[]} statuses One per customer.
 * @param {number} smartCount
 * @returns {1|2|3}
 */
export function roundStars(statuses, smartCount) {
  if (statuses.length === 0) return 1;
  const points = statuses.reduce((total, s) => total + { first: 1, retry: 0.5, failed: 0 }[s], 0);
  const base = starsForAccuracy(points / statuses.length);
  return /** @type {1|2|3} */ (smartCount >= SMART_STAR_THRESHOLD ? Math.min(3, base + 1) : base);
}
