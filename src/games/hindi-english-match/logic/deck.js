import { GameError } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { DEFAULT_LANGUAGE, similarTagOf, wordIn } from './languages.js';

/**
 * @typedef {{
 *   id: number, pairId: string, lang: import('./languages.js').LanguageId|'en', text: string, image: string, state: 'down'|'up'|'matched'
 * }} Card
 */

/**
 * Picks which pairs go in the deck. With `preferSimilar`, complete groups of look-alike words in the language (in Hindi आम / आँख,
 * दादा / दादी) are taken first, because mixing them up is what makes the Hard level hard.
 */
function choosePairs(pairs, count, rng, preferSimilar, language) {
  const pool = shuffle(rng, pairs);
  if (!preferSimilar) return pool.slice(0, count);

  const chosen = [];
  const groups = new Map();
  for (const pair of pool) {
    const tag = similarTagOf(pair, language);
    if (tag) groups.set(tag, [...(groups.get(tag) ?? []), pair]);
  }
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
 * Builds a shuffled deck with exactly two cards per pair: one in the language (Hindi unless another is asked for), one English. Cards
 * match by `pairId`, never by text, so the same English word can appear in different topics.
 *
 * @param {readonly import('./pairs.js').WordPair[]} pairs The pool to draw from. A pair with no word in the language is not used.
 * @param {number} count How many pairs to use.
 * @param {() => number} rng
 * @param {{ preferSimilar?: boolean, needImages?: boolean, language?: import('./languages.js').LanguageId }} [options] `needImages`: the
 *   level shows pictures, so use only pairs that have one (when there are enough of them), instead of leaving some cards bare.
 * @returns {Card[]} 2 x count cards, all face down, ids 0..2*count-1 in board order.
 * @throws {GameError} 'NOT_ENOUGH_PAIRS' if the pool has fewer than `count` pairs that have a word in the language.
 */
export function buildDeck(pairs, count, rng, { preferSimilar = false, needImages = false, language = DEFAULT_LANGUAGE } = {}) {
  const usable = pairs.filter((p) => wordIn(p, language) !== null);
  if (!Number.isInteger(count) || count < 1 || count > usable.length) {
    throw new GameError('NOT_ENOUGH_PAIRS', `Need ${count} pairs but only ${usable.length} are available`, { count, available: usable.length, language });
  }
  const withImages = needImages ? usable.filter((p) => p.image) : usable;
  const pool = withImages.length >= count ? withImages : usable;
  const cards = choosePairs(pool, count, rng, preferSimilar, language).flatMap((p) => [
    { pairId: p.pairId, lang: language, text: /** @type {string} */ (wordIn(p, language)), image: p.image ?? '' },
    { pairId: p.pairId, lang: 'en', text: p.en, image: p.image ?? '' },
  ]);
  // Fisher–Yates (inside `shuffle`): every order is equally likely.
  return shuffle(rng, cards).map((card, id) => ({ id, ...card, state: 'down' }));
}
