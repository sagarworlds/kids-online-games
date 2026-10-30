import { GameError, invalidData } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { LEVEL_IDS, LEVELS, levelOfWord, WORDS_PER_ROUND } from './levels.js';

/**
 * @typedef {{ word: string, clue: string, emoji: string }} WordEntry  `emoji` is the picture.
 * @typedef {{ id: string, name: string, icon: string, words: WordEntry[] }} WordPack
 * @typedef {{ packs: WordPack[] }} WordData
 */

const FILE = 'words.json';
const MIN_WORDS_PER_PACK = 25;
/** Every pack needs this many words at each level, so any pack and level can fill a round of ten. */
const MIN_PER_LEVEL = WORDS_PER_ROUND;

/**
 * Checks the word list. Beyond the shape it checks the things the game relies on: words are lowercase letters only
 * and 3 to 9 long (so they fit a level), no word is in the list twice, and every pack has enough words at every level
 * for a full round.
 *
 * @param {any} data
 * @returns {WordData}
 * @throws {GameError} 'INVALID_DATA' naming the field.
 */
export function validateWords(data) {
  if (!Array.isArray(data?.packs) || data.packs.length === 0) invalidData(FILE, 'packs', 'must be a non-empty array');
  const seenWords = new Set();
  const seenPacks = new Set();
  data.packs.forEach((pack, p) => {
    const at = `packs[${p}]`;
    if (typeof pack?.id !== 'string' || !/^[a-z]+$/.test(pack.id)) invalidData(FILE, `${at}.id`, 'must be lowercase letters');
    if (seenPacks.has(pack.id)) invalidData(FILE, `${at}.id`, `"${pack.id}" appears twice`);
    seenPacks.add(pack.id);
    if (typeof pack.name !== 'string' || !pack.name) invalidData(FILE, `${at}.name`, 'must be a non-empty string');
    if (typeof pack.icon !== 'string' || !pack.icon) invalidData(FILE, `${at}.icon`, 'must be a non-empty string');
    if (!Array.isArray(pack.words) || pack.words.length < MIN_WORDS_PER_PACK) {
      invalidData(FILE, `${at}.words`, `must hold at least ${MIN_WORDS_PER_PACK} words`);
    }
    const perLevel = Object.fromEntries(LEVEL_IDS.map((id) => [id, 0]));
    pack.words.forEach((entry, w) => {
      const where = `${at}.words[${w}]`;
      if (typeof entry?.word !== 'string' || !/^[a-z]+$/.test(entry.word)) invalidData(FILE, `${where}.word`, 'must be lowercase letters a to z only');
      const level = levelOfWord(entry.word);
      if (!level) invalidData(FILE, `${where}.word`, `"${entry.word}" must be ${LEVELS.easy.minLength} to ${LEVELS.hard.maxLength} letters long`);
      if (seenWords.has(entry.word)) invalidData(FILE, `${where}.word`, `"${entry.word}" appears twice`);
      seenWords.add(entry.word);
      if (typeof entry.clue !== 'string' || !entry.clue.trim()) invalidData(FILE, `${where}.clue`, 'must be a non-empty string');
      if (typeof entry.emoji !== 'string' || !entry.emoji) invalidData(FILE, `${where}.emoji`, 'must be a non-empty string');
      perLevel[level] += 1;
    });
    for (const id of LEVEL_IDS) {
      if (perLevel[id] < MIN_PER_LEVEL) invalidData(FILE, `${at}.words`, `needs at least ${MIN_PER_LEVEL} ${id} words (has ${perLevel[id]})`);
    }
  });
  return data;
}

/**
 * The words of a pack that suit a level.
 * @param {WordData} data
 * @param {string} packId
 * @param {'easy'|'medium'|'hard'} levelId
 * @returns {WordEntry[]}
 * @throws {GameError} 'UNKNOWN_PACK'
 */
export function wordsFor(data, packId, levelId) {
  const pack = data.packs.find((p) => p.id === packId);
  if (!pack) throw new GameError('UNKNOWN_PACK', `Unknown word pack "${packId}"`, { packId });
  return pack.words.filter((entry) => levelOfWord(entry.word) === levelId);
}

/**
 * Ten different words for a round, in random order. (A pack with fewer than ten at the level is rejected when the
 * data loads, but if one slips through the round is simply shorter rather than failing.)
 * @param {WordEntry[]} candidates
 * @param {() => number} rng
 * @param {number} [count]
 * @returns {WordEntry[]}
 */
export function pickWords(candidates, rng, count = WORDS_PER_ROUND) {
  return shuffle(rng, candidates).slice(0, count);
}
