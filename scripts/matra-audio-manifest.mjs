// Lists the recordings in src/games/matra-mixer/assets/audio/<hi|mr>/ in data/audio-manifest.json, and says which syllables
// still have no recording. Run it after adding or removing recordings:
//
//   node scripts/matra-audio-manifest.mjs
//
// The game only asks for files named in the manifest, so a missing recording never causes a failed download: the browser
// voice speaks that syllable instead.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANG_IDS, VOWEL_SET_IDS } from '../src/games/matra-mixer/logic/devanagari.js';
import { contentFor } from '../src/games/matra-mixer/logic/levels.js';
import { validateManifest } from '../src/games/matra-mixer/logic/audio.js';

const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '../src/games/matra-mixer');
const CLIP = /^([a-z]+-[a-z]+)\.(mp3|ogg|m4a|wav)$/;

/**
 * Reads the recordings folder.
 * @param {string} audioDir The folder with one sub-folder for each language.
 * @returns {Promise<{ manifest: Record<string, string[]>, ignored: string[] }>} `ignored` are files that are not named like a
 *   recording (such as ".gitkeep"), reported so a mistyped name is noticed.
 */
export async function buildManifest(audioDir) {
  const manifest = {};
  const ignored = [];
  for (const lang of LANG_IDS) {
    const dir = join(audioDir, lang);
    const names = existsSync(dir) ? await readdir(dir) : [];
    manifest[lang] = names.filter((n) => CLIP.test(n)).sort();
    ignored.push(...names.filter((n) => !CLIP.test(n) && n !== '.gitkeep').map((n) => `${lang}/${n}`));
  }
  return { manifest: validateManifest(manifest), ignored };
}

/**
 * The syllables of a language (in the longest set, with every sign) that have no recording yet.
 * @param {Record<string, string[]>} manifest
 * @param {string} lang
 * @returns {string[]} Syllable ids such as "k-aa".
 */
export function missingClips(manifest, lang) {
  const have = new Set(manifest[lang].map((n) => CLIP.exec(n)[1]));
  const { syllables } = contentFor({ tier: 3, lang, vowelSet: VOWEL_SET_IDS.at(-1) });
  return syllables.map((s) => s.id).filter((id) => !have.has(id));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { manifest, ignored } = await buildManifest(join(GAME, 'assets/audio'));
  await writeFile(join(GAME, 'data/audio-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  for (const lang of LANG_IDS) {
    const missing = missingClips(manifest, lang);
    console.log(`${lang}: ${manifest[lang].length} recordings, ${missing.length} syllables still use the browser voice`);
  }
  if (ignored.length) console.warn(`Ignored (not named like "k-aa.mp3"): ${ignored.join(', ')}`);
  console.log(`Wrote ${join(GAME, 'data/audio-manifest.json')} (${(await readFile(join(GAME, 'data/audio-manifest.json'), 'utf8')).length} bytes)`);
}
