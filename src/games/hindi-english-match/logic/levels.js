import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, pairs: number, cols: number,
 *   pictures: boolean, tinted: boolean, similarWords: boolean
 * }} LevelConfig
 * `pictures`: show a small picture under each word. `tinted`: Hindi cards orange, English blue (Easy only).
 * `similarWords`: prefer pairs whose Hindi words look alike (आम / आँख), which makes mismatches easier to make.
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: '6 pairs, with pictures', pairs: 6, cols: 4, pictures: true, tinted: true, similarWords: false }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: '8 pairs, no pictures', pairs: 8, cols: 4, pictures: false, tinted: false, similarWords: false }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: '10 pairs, look-alike words', pairs: 10, cols: 5, pictures: false, tinted: false, similarWords: true }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
/** The topic option that draws pairs from every topic. */
export const MIXED = 'Mixed';
/** "Practice" mode shows every card for this long before flipping them down. */
export const PEEK_SECONDS = 5;
/** A wrong pair stays visible this long before flipping back. */
export const FLIP_BACK_SECONDS = 1;

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
