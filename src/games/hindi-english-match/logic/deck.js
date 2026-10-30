import { GameError } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';

/**
 * @typedef {{
 *   id: number, pairId: string, lang: 'hi'|'en', text: string, image: string, state: 'down'|'up'|'matched'
 * }} Card
 */

/**
 * Picks which pairs go in the deck. With `preferSimilar`, complete groups of look-alike Hindi words (आम / आँख,
 * दादा / दादी) are taken first, because mixing them up is what makes the Hard level hard.
 */
function choosePairs(pairs, count, rng, preferSimilar) {
  const pool = shuffle(rng, pairs);
  if (!preferSimilar) return pool.slice(0, count);

  const chosen = [];
  const groups = new Map();
  for (const pair of pool) if (pair.similar) groups.set(pair.similar, [...(groups.get(pair.similar) ?? []), pair]);
  for (const group of shuffle(rng, [...groups.values()])) {
    if (group.length >= 2 && chosen.length + group.length <= count) chosen.push(...group);
  }
  for (const pair of pool) {
    if (chosen.length >= count) break;
    if (!chosen.includes(pair)) chosen.push(pair);
  }
  return chosen;
}

/**
 * Builds a shuffled deck with exactly two cards per pair: one Hindi, one English. Cards match by `pairId`, never by
 * text, so the same English word can appear in different topics.
 *
 * @param {readonly import('./pairs.js').WordPair[]} pairs The pool to draw from.
 * @param {number} count How many pairs to use.
 * @param {() => number} rng
 * @param {{ preferSimilar?: boolean, needImages?: boolean }} [options] `needImages`: the level shows pictures, so use
 *   only pairs that have one (when there are enough of them), instead of leaving some cards bare.
 * @returns {Card[]} 2 x count cards, all face down, ids 0..2*count-1 in board order.
 * @throws {GameError} 'NOT_ENOUGH_PAIRS' if the pool has fewer than `count` pairs.
 */
export function buildDeck(pairs, count, rng, { preferSimilar = false, needImages = false } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > pairs.length) {
    throw new GameError('NOT_ENOUGH_PAIRS', `Need ${count} pairs but only ${pairs.length} are available`, { count, available: pairs.length });
  }
  const withImages = needImages ? pairs.filter((p) => p.image) : pairs;
  const pool = withImages.length >= count ? withImages : pairs;
  const cards = choosePairs(pool, count, rng, preferSimilar).flatMap((p) => [
    { pairId: p.pairId, lang: 'hi', text: p.hi, image: p.image ?? '' },
    { pairId: p.pairId, lang: 'en', text: p.en, image: p.image ?? '' },
  ]);
  // Fisher–Yates (inside `shuffle`): every order is equally likely.
  return shuffle(rng, cards).map((card, id) => ({ id, ...card, state: 'down' }));
}
