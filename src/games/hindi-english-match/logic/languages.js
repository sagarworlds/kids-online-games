import { GameError } from '../../../engine/utils/errors.js';

/**
 * The languages a card can show opposite English. `id` is the key of the word in `data/pairs.json` and the language tag put on the page, so a
 * screen reader says the word in the right voice. English is not a choice: it is always the other half of a pair.
 *
 * @typedef {'hi'|'mr'} LanguageId
 * @typedef {{ id: LanguageId, name: string, label: string, voice: string, tag: string, example: string }} Language
 *   `label` is the language's name in its own script (for the menu), `voice` the language code of the speech voice, `tag` the short mark
 *   on a card, which says the language by more than its tint, and `example` the word for "apple" the menu shows as an example.
 */

/** @type {Readonly<Record<LanguageId, Readonly<Language>>>} */
export const LANGUAGES = Object.freeze({
  hi: Object.freeze({ id: 'hi', name: 'Hindi', label: 'हिन्दी', voice: 'hi-IN', tag: 'हिं', example: 'सेब' }),
  mr: Object.freeze({ id: 'mr', name: 'Marathi', label: 'मराठी', voice: 'mr-IN', tag: 'मरा', example: 'सफरचंद' }),
});
export const LANGUAGE_IDS = Object.freeze(Object.keys(LANGUAGES));
/** The language the game was made for, and the one a child gets until they choose another. */
export const DEFAULT_LANGUAGE = 'hi';

/** The other half of every pair. */
export const ENGLISH = Object.freeze({ id: 'en', name: 'English', voice: 'en-IN', tag: 'EN' });

/**
 * @param {string} id
 * @returns {Readonly<Language>}
 * @throws {GameError} 'UNKNOWN_LANGUAGE'
 */
export function getLanguage(id) {
  if (!Object.hasOwn(LANGUAGES, id)) throw new GameError('UNKNOWN_LANGUAGE', `Unknown language "${id}"`, { id });
  return LANGUAGES[id];
}

/**
 * The speech voice for the words on a card.
 * @param {LanguageId|'en'} cardLanguage The `lang` of a card.
 * @returns {string} A language code such as "mr-IN".
 * @throws {GameError} 'UNKNOWN_LANGUAGE'
 */
export const voiceOf = (cardLanguage) => (cardLanguage === 'en' ? ENGLISH.voice : getLanguage(cardLanguage).voice);

/**
 * The word a pair has in a language.
 * @param {Record<string, any>} pair
 * @param {LanguageId} languageId
 * @returns {string|null} `null` when the pair has none (a few family words have no single Marathi word, so those pairs are left out of it).
 */
export const wordIn = (pair, languageId) => (typeof pair[languageId] === 'string' && pair[languageId] !== '' ? pair[languageId] : null);

/**
 * The tag that groups look-alike words in a language, such as आम / आँख in Hindi. Hindi's is `similar`; another language's is `similar` and
 * its capitalised id (`similarMr`), because words that look alike in one language rarely do in another.
 * @param {Record<string, any>} pair
 * @param {LanguageId} languageId
 * @returns {string|undefined}
 */
export function similarTagOf(pair, languageId) {
  return languageId === DEFAULT_LANGUAGE ? pair.similar : pair[`similar${languageId.charAt(0).toUpperCase()}${languageId.slice(1)}`];
}

/**
 * The key a language's stars are saved under. Hindi keeps the plain level id, as every save made before there was a second language has it, so
 * nothing already earned is lost; another language adds its id.
 * @param {LanguageId} languageId
 * @param {'easy'|'medium'|'hard'} levelId
 * @returns {string}
 */
export const levelKey = (languageId, levelId) => (languageId === DEFAULT_LANGUAGE ? levelId : `${languageId}-${levelId}`);

/**
 * The language a child chose last, read from a save's `extra`, which can hold anything, so it is never trusted.
 * @param {any} extra
 * @returns {LanguageId}
 */
export function readLanguage(extra) {
  const id = extra?.language;
  return typeof id === 'string' && Object.hasOwn(LANGUAGES, id) ? /** @type {LanguageId} */ (id) : DEFAULT_LANGUAGE;
}

/**
 * @param {any} extra
 * @param {LanguageId} languageId
 * @returns {object} A new `extra` that remembers the language; the rest of `extra` is kept.
 * @throws {GameError} 'UNKNOWN_LANGUAGE'
 */
export function withLanguage(extra, languageId) {
  getLanguage(languageId);
  return { ...(extra && typeof extra === 'object' ? extra : {}), language: languageId };
}
