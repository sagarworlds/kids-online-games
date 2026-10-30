import { GameError, invalidData } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { LEVEL_IDS, LEVELS, SENTENCES_PER_ROUND } from './levels.js';

/**
 * @typedef {{
 *   id: string, level: 'easy'|'medium'|'hard', words: string[], alternatives?: string[][],
 *   distractor?: string, emoji?: string
 * }} SentenceEntry
 * `words` is the sentence as the carriages show it: the first word keeps its capital letter and the last carries the
 * punctuation. `alternatives` are other correct orders made of exactly the same carriages.
 */

const FILE = 'sentences.json';
const MIN_PER_LEVEL = 30;
const END_MARK = /[.?!]$/;
/** The same carriages in a different order are the same multiset; this makes that comparable. */
const multiset = (words) => [...words].sort().join('\u0000');

/**
 * Checks the sentence list. Besides the shape it checks what the rules depend on: the first word is capitalised and
 * the last ends a sentence (otherwise the capital letter and punctuation clues would lie), nothing else ends a
 * sentence, every alternative is a re-ordering of the same carriages, a Hard distractor is a single word that is not in
 * the sentence, and each level has enough sentences of the right length for a round.
 *
 * @param {any} data
 * @returns {{ sentences: SentenceEntry[] }}
 * @throws {GameError} 'INVALID_DATA' naming the field.
 */
export function validateSentences(data) {
  if (!Array.isArray(data?.sentences) || data.sentences.length === 0) invalidData(FILE, 'sentences', 'must be a non-empty array');
  const ids = new Set();
  const perLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));
  data.sentences.forEach((entry, i) => {
    const at = `sentences[${i}]`;
    if (typeof entry?.id !== 'string' || !entry.id) invalidData(FILE, `${at}.id`, 'must be a non-empty string');
    if (ids.has(entry.id)) invalidData(FILE, `${at}.id`, `"${entry.id}" appears twice`);
    ids.add(entry.id);
    const level = LEVELS[entry.level];
    if (!level) invalidData(FILE, `${at}.level`, 'must be "easy", "medium" or "hard"');
    if (!Array.isArray(entry.words) || entry.words.some((w) => typeof w !== 'string' || !w || /\s/.test(w))) {
      invalidData(FILE, `${at}.words`, 'must be a list of single words');
    }
    if (entry.words.length < level.minWords || entry.words.length > level.maxWords) {
      invalidData(FILE, `${at}.words`, `a ${entry.level} sentence needs ${level.minWords} to ${level.maxWords} words (has ${entry.words.length})`);
    }
    const first = entry.words[0];
    if (first[0] !== first[0].toUpperCase() || first[0] === first[0].toLowerCase()) invalidData(FILE, `${at}.words`, 'the first word must start with a capital letter');
    if (!END_MARK.test(entry.words[entry.words.length - 1])) invalidData(FILE, `${at}.words`, 'the last word must end with . ? or !');
    if (entry.words.slice(0, -1).some((w) => END_MARK.test(w))) invalidData(FILE, `${at}.words`, 'only the last word may end with . ? or !');
    for (const [a, alt] of (entry.alternatives ?? []).entries()) {
      if (!Array.isArray(alt) || multiset(alt) !== multiset(entry.words)) {
        invalidData(FILE, `${at}.alternatives[${a}]`, 'must use exactly the same words as the sentence, in another order');
      }
    }
    if (level.distractor) {
      if (typeof entry.distractor !== 'string' || !/^[a-z]+$/.test(entry.distractor)) invalidData(FILE, `${at}.distractor`, 'a hard sentence needs one lowercase extra word');
      if (entry.words.some((w) => w.toLowerCase().replace(/[^a-z]/g, '') === entry.distractor)) invalidData(FILE, `${at}.distractor`, 'must not be a word of the sentence');
    } else if (entry.distractor !== undefined) {
      invalidData(FILE, `${at}.distractor`, 'only hard sentences have an extra carriage');
    }
    if (entry.emoji !== undefined && (typeof entry.emoji !== 'string' || !entry.emoji)) invalidData(FILE, `${at}.emoji`, 'must be a non-empty string when given');
    perLevel[entry.level] += 1;
  });
  for (const id of LEVEL_IDS) {
    if (perLevel[id] < MIN_PER_LEVEL) invalidData(FILE, 'sentences', `needs at least ${MIN_PER_LEVEL} ${id} sentences (has ${perLevel[id]})`);
  }
  return data;
}

/** @param {{ sentences: SentenceEntry[] }} data @param {string} levelId @returns {SentenceEntry[]} */
export function sentencesFor(data, levelId) {
  if (!LEVELS[levelId]) throw new GameError('UNKNOWN_LEVEL', `Unknown level "${levelId}"`, { id: levelId });
  return data.sentences.filter((s) => s.level === levelId);
}

/**
 * Eight different sentences for a round, in random order.
 * @param {SentenceEntry[]} candidates
 * @param {() => number} rng
 * @param {number} [count]
 * @returns {SentenceEntry[]}
 */
export function pickSentences(candidates, rng, count = SENTENCES_PER_ROUND) {
  return shuffle(rng, candidates).slice(0, count);
}

/**
 * Every accepted word order: the main one and any alternatives.
 * @param {SentenceEntry} entry
 * @returns {string[][]}
 */
export const acceptedOrders = (entry) => [entry.words, ...(entry.alternatives ?? [])];

/** @param {SentenceEntry} entry @returns {string} The sentence as written, for reading aloud and showing. */
export const sentenceText = (entry) => entry.words.join(' ');
