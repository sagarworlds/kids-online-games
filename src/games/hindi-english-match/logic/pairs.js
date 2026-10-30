import { invalidData } from '../../../engine/utils/errors.js';

/**
 * @typedef {{ pairId: string, hi: string, en: string, image?: string, topic: string, similar?: string }} WordPair
 * `image` is a small emoji shown on Easy. `similar` tags Hindi words that look alike (the same tag on two or more pairs).
 */

const FILE = 'pairs.json';
export const MIN_PAIRS_PER_TOPIC = 12;
const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Validates `data/pairs.json` when it loads.
 * @param {any} data Parsed JSON.
 * @returns {{ topics: string[], pairs: WordPair[] }}
 * @throws {GameError} Code 'INVALID_DATA' naming the file and the exact field.
 */
export function validatePairs(data) {
  if (!Array.isArray(data?.topics) || data.topics.length === 0 || data.topics.some((t) => typeof t !== 'string' || !t)) {
    invalidData(FILE, 'topics', 'must be a non-empty array of topic names');
  }
  if (!Array.isArray(data?.pairs) || data.pairs.length === 0) invalidData(FILE, 'pairs', 'must be a non-empty array');

  const seen = new Set();
  const perTopic = new Map(data.topics.map((t) => [t, 0]));
  const similar = new Map();
  data.pairs.forEach((p, i) => {
    const at = `pairs[${i}]`;
    if (typeof p.pairId !== 'string' || !p.pairId) invalidData(FILE, `${at}.pairId`, 'must be a non-empty string');
    if (seen.has(p.pairId)) invalidData(FILE, `${at}.pairId`, `"${p.pairId}" is used twice`);
    seen.add(p.pairId);
    if (typeof p.hi !== 'string' || !DEVANAGARI.test(p.hi)) invalidData(FILE, `${at}.hi`, 'must be a Hindi word written in Devanagari');
    if (typeof p.en !== 'string' || !p.en.trim()) invalidData(FILE, `${at}.en`, 'must be a non-empty string');
    if (!perTopic.has(p.topic)) invalidData(FILE, `${at}.topic`, `"${p.topic}" is not in the topics list`);
    perTopic.set(p.topic, perTopic.get(p.topic) + 1);
    if (p.image !== undefined && typeof p.image !== 'string') invalidData(FILE, `${at}.image`, 'must be a string');
    if (p.similar !== undefined) similar.set(p.similar, (similar.get(p.similar) ?? 0) + 1);
  });
  for (const [topic, count] of perTopic) {
    if (count < MIN_PAIRS_PER_TOPIC) invalidData(FILE, `topics["${topic}"]`, `has ${count} pairs; at least ${MIN_PAIRS_PER_TOPIC} are needed`);
  }
  for (const [tag, count] of similar) {
    if (count < 2) invalidData(FILE, 'pairs[].similar', `tag "${tag}" is used by only one pair; look-alike groups need two or more`);
  }
  return { topics: data.topics, pairs: data.pairs };
}

/**
 * @param {readonly WordPair[]} pairs
 * @param {string} topic A topic name, or `Mixed` for all of them.
 * @param {string} mixed The name that means "every topic".
 * @returns {WordPair[]}
 */
export function pairsForTopic(pairs, topic, mixed) {
  return topic === mixed ? [...pairs] : pairs.filter((p) => p.topic === topic);
}
