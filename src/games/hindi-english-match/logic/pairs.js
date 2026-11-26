import { invalidData } from '../../../engine/utils/errors.js';
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_IDS, similarTagOf, wordIn } from './languages.js';

/**
 * @typedef {{
 *   pairId: string, hi: string, mr?: string, en: string, image?: string, topic: string, similar?: string, similarMr?: string
 * }} WordPair
 * `hi` and `mr` are the word in Hindi and in Marathi (a pair may have no Marathi word, see `wordIn`), both in Devanagari. `image` is a small
 * emoji shown on Easy. `similar` tags Hindi words that look alike (the same tag on two or more pairs), and `similarMr` does the same for Marathi.
 */

const FILE = 'pairs.json';
export const MIN_PAIRS_PER_TOPIC = 12;
const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Validates `data/pairs.json` when it loads.
 *
 * Besides the shape: a Hindi word for every pair; a Marathi word, where there is one, in Devanagari too; no word twice in a language (two cards
 * that read the same cannot be told apart); at least 12 pairs of every topic in every language, so any topic can fill a round; and look-alike
 * tags that name two or more words.
 *
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
  /** @type {Record<string, Map<string, number>>} */
  const perTopic = Object.fromEntries(LANGUAGE_IDS.map((id) => [id, new Map(data.topics.map((t) => [t, 0]))]));
  const words = Object.fromEntries(LANGUAGE_IDS.map((id) => [id, new Map()]));
  const similar = Object.fromEntries(LANGUAGE_IDS.map((id) => [id, new Map()]));
  data.pairs.forEach((p, i) => {
    const at = `pairs[${i}]`;
    if (typeof p.pairId !== 'string' || !p.pairId) invalidData(FILE, `${at}.pairId`, 'must be a non-empty string');
    if (seen.has(p.pairId)) invalidData(FILE, `${at}.pairId`, `"${p.pairId}" is used twice`);
    seen.add(p.pairId);
    if (typeof p.en !== 'string' || !p.en.trim()) invalidData(FILE, `${at}.en`, 'must be a non-empty string');
    if (!perTopic[DEFAULT_LANGUAGE].has(p.topic)) invalidData(FILE, `${at}.topic`, `"${p.topic}" is not in the topics list`);
    if (p.image !== undefined && typeof p.image !== 'string') invalidData(FILE, `${at}.image`, 'must be a string');

    for (const language of LANGUAGE_IDS) {
      const word = p[language];
      if (word === undefined && language !== DEFAULT_LANGUAGE) continue;
      if (typeof word !== 'string' || !DEVANAGARI.test(word)) invalidData(FILE, `${at}.${language}`, `must be a ${LANGUAGES[language].name} word written in Devanagari`);
      if (words[language].has(word)) invalidData(FILE, `${at}.${language}`, `"${word}" is also the word of "${words[language].get(word)}", so two cards would read the same`);
      words[language].set(word, p.pairId);
      perTopic[language].set(p.topic, perTopic[language].get(p.topic) + 1);
      const tag = similarTagOf(p, language);
      if (tag !== undefined) similar[language].set(tag, (similar[language].get(tag) ?? 0) + 1);
    }
  });
  for (const language of LANGUAGE_IDS) {
    for (const [topic, count] of perTopic[language]) {
      if (count < MIN_PAIRS_PER_TOPIC) invalidData(FILE, `topics["${topic}"]`, `has ${count} ${LANGUAGES[language].name} pairs; at least ${MIN_PAIRS_PER_TOPIC} are needed`);
    }
    for (const [tag, count] of similar[language]) {
      if (count < 2) invalidData(FILE, 'pairs[].similar', `${LANGUAGES[language].name} tag "${tag}" is used by only one pair; look-alike groups need two or more`);
    }
  }
  return { topics: data.topics, pairs: data.pairs };
}

/**
 * @param {readonly WordPair[]} pairs
 * @param {string} topic A topic name, or `Mixed` for all of them.
 * @param {string} mixed The name that means "every topic".
 * @param {import('./languages.js').LanguageId} [language] Only pairs that have a word in it are given back.
 * @returns {WordPair[]}
 */
export function pairsForTopic(pairs, topic, mixed, language = DEFAULT_LANGUAGE) {
  return pairs.filter((p) => (topic === mixed || p.topic === topic) && wordIn(p, language) !== null);
}
