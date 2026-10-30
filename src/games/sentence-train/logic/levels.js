import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, minWords: number, maxWords: number, distractor: boolean
 * }} LevelConfig
 * `distractor`: one extra carriage that does not belong in the sentence and has to be left on the siding.
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: '3 to 5 words, simple sentences', minWords: 3, maxWords: 5, distractor: false }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: '5 to 7 words, with questions', minWords: 5, maxWords: 7, distractor: false }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: '7 to 10 words, one extra carriage', minWords: 7, maxWords: 10, distractor: true }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
export const SENTENCES_PER_ROUND = 8;
export const HINTS_PER_ROUND = 2;
/** After a wrong whistle the child may try again this many times; the next wrong one shows the answer. */
export const MAX_RETRIES = 2;
/** Sentences built right first time needed for 3 and 2 stars. */
export const THREE_STARS_AT = 7;
export const TWO_STARS_AT = 5;

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
