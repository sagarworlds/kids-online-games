import { GameError } from '../engine/utils/errors.js';

export const NAME_MIN = 2;
export const NAME_MAX = 20;

/**
 * Letters of any script, combining marks and digits. Combining marks (`\p{M}`)
 * matter: Devanagari vowel signs such as the "ा" in "सागर" are marks, not
 * letters, so the plain `[\p{L}\p{N} ]` pattern would wrongly reject Hindi names.
 */
const ALLOWED = /^[\p{L}\p{M}\p{N} ]+$/u;
const HAS_BASE_CHARACTER = /[\p{L}\p{N}]/u;

/** Friendly texts shown to the child, keyed by failure reason. */
export const NAME_MESSAGES = Object.freeze({
  length: `Names need ${NAME_MIN} to ${NAME_MAX} letters`,
  chars: 'Please use only letters, numbers and spaces',
  rude: "Let's pick a kinder name",
});

// Common look-alike digits, so "Id1ot" is caught like "Idiot".
const LOOKALIKES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };

/**
 * @param {string} text
 * @returns {string} Lower-cased text with look-alike digits turned into letters.
 */
function normaliseForBlocklist(text) {
  return text.toLocaleLowerCase().replace(/[013457]/g, (digit) => LOOKALIKES[digit]);
}

/**
 * True if any word of the name, or the whole name with spaces removed, is on
 * the blocklist. Whole-word matching is deliberate: substring matching flags
 * innocent words ("class" contains "ass"). This is a first line of defence;
 * names never leave the device.
 * @param {string} name
 * @param {readonly string[]} blocklist
 * @returns {boolean}
 */
export function containsBlockedWord(name, blocklist) {
  if (blocklist.length === 0) return false;
  const blocked = new Set(blocklist.map((w) => w.toLocaleLowerCase()));
  const normal = normaliseForBlocklist(name);
  return normal.split(/\s+/).some((word) => blocked.has(word)) || blocked.has(normal.replace(/\s+/g, ''));
}

/**
 * Checks a typed name and returns the cleaned version.
 * Cleaning: trim, and squash repeated spaces into one.
 *
 * @param {string} raw What the child typed.
 * @param {readonly string[]} [blocklist]
 * @returns {string} The cleaned, valid name.
 * @throws {GameError} Code 'INVALID_NAME'; `message` is child-friendly and
 *   `context.reason` is one of 'length' | 'chars' | 'rude'.
 */
export function validateName(raw, blocklist = []) {
  const fail = (reason) => {
    throw new GameError('INVALID_NAME', NAME_MESSAGES[reason], { reason });
  };
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  const length = Array.from(name).length; // code points, so emoji-free names count as typed
  if (length < NAME_MIN || length > NAME_MAX) fail('length');
  if (!ALLOWED.test(name) || !HAS_BASE_CHARACTER.test(name)) fail('chars');
  if (containsBlockedWord(name, blocklist)) fail('rude');
  return name;
}
