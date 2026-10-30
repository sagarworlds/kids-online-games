import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{ word: string, filled: number, mistakes: number }} Spelling
 * `filled` is how many letters are in their slots; the next slot to fill is `word[filled]`.
 */

/**
 * Starts a word. With `prefillFirst` (Easy) the first letter is already in place.
 * @param {string} word
 * @param {{ prefillFirst?: boolean }} [options]
 * @returns {Spelling}
 * @throws {GameError} 'EMPTY_WORD'
 */
export function startWord(word, { prefillFirst = false } = {}) {
  if (!word) throw new GameError('EMPTY_WORD', 'A word needs at least one letter');
  return Object.freeze({ word, filled: prefillFirst ? 1 : 0, mistakes: 0 });
}

/** @param {Spelling} state @returns {string|null} The letter the child needs next, or null when the word is done. */
export const nextLetter = (state) => (state.filled < state.word.length ? state.word[state.filled] : null);

/** @param {Spelling} state @returns {boolean} */
export const isComplete = (state) => state.filled >= state.word.length;

/**
 * Letters still to be popped: every letter after the filled ones (repeated letters each count).
 * @param {Spelling} state
 * @returns {string[]}
 */
export const remainingLetters = (state) => state.word.slice(state.filled).split('');

/**
 * The child pops a bubble with this letter.
 * Only the *next* letter fills a slot: any other letter, including a letter that is in the word but comes later, is
 * wrong, never fills anything and counts as a mistake.
 *
 * @param {Spelling} state
 * @param {string} letter
 * @returns {{ result: 'correct'|'wrong'|'complete', state: Spelling }} `complete` when this letter finished the word.
 * @throws {GameError} 'WORD_COMPLETE' if the word was already finished.
 */
export function tryLetter(state, letter) {
  if (isComplete(state)) throw new GameError('WORD_COMPLETE', `"${state.word}" is already spelled`, { word: state.word });
  if (letter !== nextLetter(state)) {
    return { result: 'wrong', state: Object.freeze({ ...state, mistakes: state.mistakes + 1 }) };
  }
  const next = Object.freeze({ ...state, filled: state.filled + 1 });
  return { result: isComplete(next) ? 'complete' : 'correct', state: next };
}
