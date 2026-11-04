import { invalidData } from '../../../engine/utils/errors.js';
import { LANG_IDS } from './devanagari.js';

const FILE = 'audio-manifest.json';
const CLIP_FILE = /^[a-z]+-[a-z]+\.(mp3|ogg|m4a|wav)$/;

/** @typedef {Record<import('./devanagari.js').Lang, string[]>} Manifest */

/**
 * The list of recordings that exist, so the game only asks for files that are there (and never logs a failed download for
 * the many syllables nobody has recorded yet). An entry is a file name such as "k-aa.mp3".
 * @param {unknown} raw
 * @returns {Manifest}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validateManifest(raw) {
  const out = {};
  for (const lang of LANG_IDS) {
    const list = raw?.[lang];
    if (!Array.isArray(list)) invalidData(FILE, lang, 'must be a list of file names');
    list.forEach((name, i) => {
      if (typeof name !== 'string' || !CLIP_FILE.test(name)) invalidData(FILE, `${lang}[${i}]`, `"${name}" must be a file name like "k-aa.mp3"`);
    });
    if (new Set(list).size !== list.length) invalidData(FILE, lang, 'lists the same file twice');
    out[lang] = [...list];
  }
  return out;
}

/**
 * The recording for a syllable, if there is one.
 * @param {Manifest} manifest
 * @param {import('./devanagari.js').Lang} lang
 * @param {string} id A syllable id such as "k-aa".
 * @returns {string|null} The file name.
 */
export const clipFor = (manifest, lang, id) => manifest[lang]?.find((name) => name.startsWith(`${id}.`)) ?? null;

/** Where a recording is, relative to the game's page. @param {import('./devanagari.js').Lang} lang @param {string} file */
export const clipUrl = (lang, file) => `assets/audio/${lang}/${file}`;

/**
 * How to say a run of syllables (a syllable on its own, or a word): the recordings in turn if every one exists, otherwise
 * the text spoken by the browser. Recorded voices are always preferred; the browser's Hindi and Marathi voices can say a
 * syllable wrongly.
 *
 * @param {Manifest} manifest
 * @param {import('./devanagari.js').Lang} lang
 * @param {readonly { id: string, text: string }[]} parts
 * @returns {{ kind: 'clips', files: string[] }|{ kind: 'speech', text: string }}
 */
export function planSpeech(manifest, lang, parts) {
  const files = parts.map((p) => clipFor(manifest, lang, p.id));
  if (files.length > 0 && files.every((f) => f !== null)) return { kind: 'clips', files };
  return { kind: 'speech', text: parts.map((p) => p.text).join('') };
}

/**
 * The parts to say for a syllable (one part) or a word (one part for each of its syllables). Each part has the recording
 * name and the text to speak if there is no recording.
 *
 * @param {{ id: string, text: string }} syllable
 * @returns {{ id: string, text: string }[]}
 */
export const syllableParts = (syllable) => [{ id: syllable.id, text: syllable.text }];

/** @param {import('./words.js').Word} word @returns {{ id: string, text: string }[]} */
export const wordParts = (word) => word.syllables.map(({ consonant, sign }) => ({ id: `${consonant.id}-${sign.id}`, text: `${consonant.char}${sign.char}` }));
