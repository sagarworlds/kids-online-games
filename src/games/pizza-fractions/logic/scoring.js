import { starsForAccuracy } from '../../../engine/utils/stars.js';

/** @typedef {'first'|'retry'|'failed'} OrderStatus */

export const COINS_FIRST_TRY = 10;
export const COINS_RETRY = 5;

/**
 * Coins for serving an order right: 10 on the first try, 5 after a retry, none if the customer left unhappy.
 * @param {OrderStatus} status
 * @returns {number}
 */
export function coinsFor(status) {
  return { first: COINS_FIRST_TRY, retry: COINS_RETRY, failed: 0 }[status];
}

/**
 * Stars use the shared default rule (90% = 3, 70% = 2) on "accuracy", where an order right first time counts 1,
 * one that needed a retry counts half, and one that was never right counts 0.
 *
 * @param {readonly OrderStatus[]} statuses One per customer.
 * @returns {1|2|3}
 */
export function roundStars(statuses) {
  if (statuses.length === 0) return 1;
  const points = statuses.reduce((sum, s) => sum + { first: 1, retry: 0.5, failed: 0 }[s], 0);
  return starsForAccuracy(points / statuses.length);
}
