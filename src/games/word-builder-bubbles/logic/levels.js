import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, minLength: number, maxLength: number,
 *   decoys: number, speed: number, collide: boolean, similarDecoys: boolean,
 *   picture: boolean, showClue: boolean, prefillFirst: boolean
 * }} LevelConfig
 *
 * `speed` is in pixels per second. `collide`: bubbles bounce off each other (Hard). `similarDecoys`: the wrong letters
 * look like letters in the word (b/d, m/n). `picture`: the picture is shown while spelling (Hard hides it until the
 * word is done). `showClue`: the clue text is shown at once (on Medium it is one tap away).
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: '3 to 4 letters, first letter given', minLength: 3, maxLength: 4, decoys: 2, speed: 40, collide: false, similarDecoys: false, picture: true, showClue: true, prefillFirst: true }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: '5 to 6 letters, picture only', minLength: 5, maxLength: 6, decoys: 3, speed: 70, collide: false, similarDecoys: false, picture: true, showClue: false, prefillFirst: false }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: '7 to 9 letters, clue words only', minLength: 7, maxLength: 9, decoys: 4, speed: 100, collide: true, similarDecoys: true, picture: false, showClue: true, prefillFirst: false }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
export const WORDS_PER_ROUND = 10;
export const HINTS_PER_ROUND = 3;
/** The next correct bubble glows this long after a hint. */
export const HINT_SECONDS = 2;
/** A bubble popped by mistake floats away, and a new one with the same letter comes back after this long. */
export const RESPAWN_SECONDS = 1.6;

/**
 * @param {string} id
 * @returns {Readonly<LevelConfig>}
 * @throws {GameError} 'UNKNOWN_LEVEL'
 */
export function getLevel(id) {
  const level = LEVELS[id];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `Unknown level "${id}"`, { id });
  return level;
}

/**
 * Which level a word belongs to, by its length. The word list carries no level of its own, so length is the one
 * source of truth.
 * @param {string} word
 * @returns {'easy'|'medium'|'hard'|null} null for a length no level covers.
 */
export function levelOfWord(word) {
  return LEVEL_IDS.find((id) => word.length >= LEVELS[id].minLength && word.length <= LEVELS[id].maxLength) ?? null;
}
