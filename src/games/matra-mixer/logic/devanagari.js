import { GameError } from '../../../engine/utils/errors.js';

/**
 * The letters of बाराखडी: the consonants, and the vowel signs (matras) that are added to them to make syllables.
 *
 * @typedef {'hi'|'mr'} Lang
 * @typedef {'baarah'|'chaudah'} VowelSet
 * @typedef {{ id: string, char: string, tier: 1|2|3, langs: readonly Lang[] }} Consonant
 *   `id` is the plain-letter name used in audio file names; `tier` is the level it first appears at (1 easy, 2 medium, 3 hard).
 * @typedef {{ id: string, char: string, vowel: string, tier: 1|2|3, set: 'both'|'chaudah' }} Sign
 *   `char` is what is added after the consonant (empty for the sound every consonant already has); `vowel` is the vowel
 *   letter it stands for.
 */

const HALANT = '्';
const BOTH = Object.freeze(['hi', 'mr']);
const C = (char, id, tier, langs = BOTH) => Object.freeze({ char, id, tier, langs });

/** The consonants in the order a बाराखडी chart lists them, then the joined letters at the end. @type {readonly Consonant[]} */
export const CONSONANTS = Object.freeze([
  C('क', 'k', 1), C('ख', 'kh', 1), C('ग', 'g', 1), C('घ', 'gh', 1),
  C('च', 'c', 1), C('छ', 'ch', 2), C('ज', 'j', 1), C('झ', 'jh', 2),
  C('ट', 'tt', 2), C('ठ', 'tth', 2), C('ड', 'dd', 2), C('ढ', 'ddh', 2), C('ण', 'nn', 2),
  C('त', 't', 1), C('थ', 'th', 2), C('द', 'd', 2), C('ध', 'dh', 2), C('न', 'n', 1),
  C('प', 'p', 1), C('फ', 'ph', 2), C('ब', 'b', 2), C('भ', 'bh', 2), C('म', 'm', 1),
  C('य', 'y', 2), C('र', 'r', 1), C('ल', 'l', 1), C('व', 'v', 2),
  C('श', 'sh', 2), C('ष', 'ss', 2), C('स', 's', 2), C('ह', 'h', 2),
  C(`क${HALANT}ष`, 'ksh', 3), C(`त${HALANT}र`, 'tr', 3), C(`ज${HALANT}ञ`, 'gy', 3), C('ळ', 'll', 3, ['mr']),
]);

const S = (id, char, vowel, tier, set = 'both') => Object.freeze({ id, char, vowel, tier, set });

/** The vowel signs, in the order they are taught. The first is the sound a consonant has on its own. @type {readonly Sign[]} */
export const SIGNS = Object.freeze([
  S('a', '', 'अ', 1), S('aa', 'ा', 'आ', 1), S('i', 'ि', 'इ', 1), S('ii', 'ी', 'ई', 1), S('u', 'ु', 'उ', 1), S('uu', 'ू', 'ऊ', 1),
  S('e', 'े', 'ए', 2), S('ai', 'ै', 'ऐ', 2), S('o', 'ो', 'ओ', 2), S('au', 'ौ', 'औ', 2),
  S('am', 'ं', 'अं', 3), S('ah', 'ः', 'अः', 3),
  S('ae', 'ॅ', 'ॲ', 3, 'chaudah'), S('ao', 'ॉ', 'ऑ', 3, 'chaudah'),
]);

/** The two sets of vowel signs a school may teach: बाराखडी has 12 (with the sound on its own), चौदाखडी adds ॅ and ॉ. */
export const VOWEL_SETS = Object.freeze({
  baarah: Object.freeze({ id: 'baarah', label: 'बाराखडी', blurb: '12 vowel signs' }),
  chaudah: Object.freeze({ id: 'chaudah', label: 'चौदाखडी', blurb: '14 vowel signs, with ॅ and ॉ' }),
});
export const VOWEL_SET_IDS = Object.freeze(Object.keys(VOWEL_SETS));

export const LANGS = Object.freeze({
  hi: Object.freeze({ id: 'hi', label: 'हिन्दी', speechLang: 'hi-IN' }),
  mr: Object.freeze({ id: 'mr', label: 'मराठी', speechLang: 'mr-IN' }),
});
export const LANG_IDS = Object.freeze(Object.keys(LANGS));

/** @param {Lang} lang @returns {Consonant[]} The consonants taught in a language. */
export const consonantsFor = (lang) => CONSONANTS.filter((c) => c.langs.includes(lang));

/** @param {VowelSet} set @returns {Sign[]} The vowel signs of a set, in teaching order. */
export const signsFor = (set) => SIGNS.filter((s) => s.set === 'both' || set === 'chaudah');

/** The written syllable: the consonant with the sign after it (or just the consonant for the sound it has on its own). */
export const composeSyllable = (consonant, sign) => `${consonant.char}${sign.char}`;

/** The name used for a syllable's recording, such as "k-aa" (का). @returns {string} */
export const syllableId = (consonant, sign) => `${consonant.id}-${sign.id}`;

/** A sign drawn on its own, on a dotted circle so it can be seen (◌ा). */
export const signOnItsOwn = (sign) => (sign.char === '' ? sign.vowel : `◌${sign.char}`);

const BY_CHAR = new Map(CONSONANTS.map((c) => [c.char, c]));
const SIGN_BY_CHAR = new Map(SIGNS.filter((s) => s.char !== '').map((s) => [s.char, s]));
const INHERENT = SIGNS[0];

/**
 * Splits a word into its syllables: each is one consonant (or one of the joined letters क्ष, त्र, ज्ञ) with at most one vowel sign.
 * Anything else (a letter on its own, a half letter, a dot under a letter) is not supported, so words in the lists must avoid it.
 *
 * @param {string} word
 * @returns {{ consonant: Consonant, sign: Sign }[]}
 * @throws {GameError} 'BAD_WORD' naming the character it cannot read.
 */
export function parseSyllables(word) {
  const letters = [...word];
  const out = [];
  for (let i = 0; i < letters.length;) {
    const joined = letters.slice(i, i + 3).join('');
    let consonant = BY_CHAR.get(joined);
    if (consonant) {
      i += 3;
    } else {
      consonant = BY_CHAR.get(letters[i]);
      if (!consonant) throw new GameError('BAD_WORD', `"${word}" has "${letters[i]}" where a consonant should be`, { word, at: i });
      i += 1;
    }
    const sign = SIGN_BY_CHAR.get(letters[i] ?? '');
    if (sign) i += 1;
    out.push({ consonant, sign: sign ?? INHERENT });
  }
  if (out.length === 0) throw new GameError('BAD_WORD', 'A word needs at least one syllable', { word });
  return out;
}
