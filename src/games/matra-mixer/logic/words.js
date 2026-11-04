import { GameError, invalidData } from '../../../engine/utils/errors.js';
import { LANG_IDS, parseSyllables } from './devanagari.js';

const FILE = 'words.json';
/** Every language needs enough words for a round at every level to have real choices. */
export const MIN_WORDS = 30;

/**
 * @typedef {{ word: string, emoji: string, meaning: string, syllables: { consonant: import('./devanagari.js').Consonant, sign: import('./devanagari.js').Sign }[] }} Word
 * @typedef {Record<import('./devanagari.js').Lang, Word[]>} WordLists
 */

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Checks the word lists and splits every word into its syllables. A word the game cannot read (a half letter, a letter on its
 * own) is refused, naming the word, so a content mistake shows up when the game loads and not as a strange round.
 *
 * @param {unknown} raw
 * @returns {WordLists}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validateWords(raw) {
  const lists = {};
  for (const lang of LANG_IDS) {
    const list = raw?.[lang];
    if (!Array.isArray(list) || list.length < MIN_WORDS) invalidData(FILE, lang, `must be a list of at least ${MIN_WORDS} words`);
    const seenWords = new Set();
    const seenEmoji = new Set();
    lists[lang] = list.map((entry, i) => {
      const at = `${lang}[${i}]`;
      if (!isText(entry?.word)) invalidData(FILE, `${at}.word`, 'must be a non-empty string');
      if (!isText(entry.emoji)) invalidData(FILE, `${at}.emoji`, 'must be a non-empty string');
      if (!isText(entry.meaning)) invalidData(FILE, `${at}.meaning`, 'must be a non-empty string');
      if (seenWords.has(entry.word)) invalidData(FILE, `${at}.word`, `"${entry.word}" appears twice`);
      if (seenEmoji.has(entry.emoji)) invalidData(FILE, `${at}.emoji`, `${entry.emoji} is used by two words, so a picture could not be told apart`);
      seenWords.add(entry.word);
      seenEmoji.add(entry.emoji);
      let syllables;
      try {
        syllables = parseSyllables(entry.word);
      } catch (error) {
        if (!(error instanceof GameError) || error.code !== 'BAD_WORD') throw error;
        invalidData(FILE, `${at}.word`, error.message);
      }
      return Object.freeze({ word: entry.word, emoji: entry.emoji, meaning: entry.meaning, syllables });
    });
  }
  return lists;
}

/**
 * The words that can be read with what is taught: every syllable of the word must be one the content has.
 * @param {readonly Word[]} words
 * @param {import('./levels.js').Content} content
 * @returns {Word[]}
 */
export function wordsFor(words, content) {
  const known = new Set(content.syllables.map((s) => s.id));
  return words.filter((w) => w.syllables.every(({ consonant, sign }) => known.has(`${consonant.id}-${sign.id}`)));
}
