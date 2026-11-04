import { LANG_IDS, VOWEL_SET_IDS } from './devanagari.js';

/** @typedef {{ lang: import('./devanagari.js').Lang, vowelSet: import('./devanagari.js').VowelSet }} Prefs */

/** Hindi and the 12 signs of बाराखडी, until a grown-up chooses otherwise. @type {Readonly<Prefs>} */
export const DEFAULT_PREFS = Object.freeze({ lang: 'hi', vowelSet: 'baarah' });

/**
 * The saved language and vowel-sign choice. A missing or damaged value falls back to the default for that one setting
 * (and is named in the log), so a bad save never stops the game.
 * @param {unknown} raw
 * @param {{ error: (...args: unknown[]) => void }} [logger]
 * @returns {Prefs}
 */
export function sanitizePrefs(raw, logger = console) {
  if (raw === undefined || raw === null) return { ...DEFAULT_PREFS };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    logger.error('[matra-mixer] saved settings are damaged; using the defaults', raw);
    return { ...DEFAULT_PREFS };
  }
  const pick = (field, allowed) => {
    if (raw[field] === undefined) return DEFAULT_PREFS[field];
    if (allowed.includes(raw[field])) return raw[field];
    logger.error(`[matra-mixer] saved ${field} "${raw[field]}" is not known; using "${DEFAULT_PREFS[field]}"`);
    return DEFAULT_PREFS[field];
  };
  return { lang: pick('lang', LANG_IDS), vowelSet: pick('vowelSet', VOWEL_SET_IDS) };
}
