import { GameError } from '../../../engine/utils/errors.js';
import { consonantsFor, signsFor, composeSyllable, syllableId } from './devanagari.js';

/**
 * @typedef {'easy'|'medium'|'hard'} LevelId
 * @typedef {{
 *   id: LevelId, label: string, blurb: string, tier: 1|2|3, rounds: number,
 *   buildChoices: number, bubbles: number, wordChoices: number
 * }} LevelConfig
 * `tier` says which consonants and signs are in play (all with a tier up to it); the counts are how many choices each
 * activity offers.
 */

/** @type {Readonly<Record<LevelId, Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: '12 letters, 6 signs', tier: 1, rounds: 10, buildChoices: 4, bubbles: 4, wordChoices: 3 }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'all letters, 10 signs', tier: 2, rounds: 10, buildChoices: 5, bubbles: 6, wordChoices: 4 }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'every sign and joined letters', tier: 3, rounds: 10, buildChoices: 6, bubbles: 8, wordChoices: 4 }),
});
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/**
 * @typedef {{ consonant: import('./devanagari.js').Consonant, sign: import('./devanagari.js').Sign, text: string, id: string }} Syllable
 * @typedef {{ consonants: import('./devanagari.js').Consonant[], signs: import('./devanagari.js').Sign[], syllables: Syllable[] }} Content
 */

/**
 * What is taught: the consonants and signs of a language and vowel set up to a tier, and every syllable they make.
 * @param {{ tier: 1|2|3, lang: import('./devanagari.js').Lang, vowelSet: import('./devanagari.js').VowelSet }} options
 * @returns {Content}
 */
export function contentFor({ tier, lang, vowelSet }) {
  const consonants = consonantsFor(lang).filter((c) => c.tier <= tier);
  const signs = signsFor(vowelSet).filter((s) => s.tier <= tier);
  const syllables = consonants.flatMap((consonant) => signs.map((sign) => Object.freeze({ consonant, sign, text: composeSyllable(consonant, sign), id: syllableId(consonant, sign) })));
  return { consonants, signs, syllables };
}

/**
 * The content of a level.
 * @param {LevelId} levelId
 * @param {import('./devanagari.js').Lang} lang
 * @param {import('./devanagari.js').VowelSet} vowelSet
 * @returns {Content}
 * @throws {GameError} 'UNKNOWN_LEVEL'
 */
export function levelContent(levelId, lang, vowelSet) {
  const level = LEVELS[levelId];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `There is no level "${levelId}"`, { levelId });
  return contentFor({ tier: level.tier, lang, vowelSet });
}

/** The key under which the stars for an activity are saved. @param {string} activity @param {string} lang @param {string} levelId */
export const roundKey = (activity, lang, levelId) => `${activity}-${lang}-${levelId}`;
