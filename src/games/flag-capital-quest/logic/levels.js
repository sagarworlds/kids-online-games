import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {'flag'|'capital'|'map'|'capital-country'} QuestionType
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, countries: readonly ('easy'|'medium'|'hard')[],
 *   types: readonly QuestionType[]
 * }} LevelConfig
 *
 * `countries` says which country levels are asked about: Medium asks about the Easy and Medium countries, Hard about all.
 * `types` are the kinds of question that appear.
 */

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'About 40 well-known countries, name the flag', countries: Object.freeze(['easy']), types: Object.freeze(['flag']) }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'About 100 countries, flags and capitals', countries: Object.freeze(['easy', 'medium']), types: Object.freeze(['flag', 'capital']) }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Every country, plus tapping the map', countries: Object.freeze(['easy', 'medium', 'hard']), types: Object.freeze(['flag', 'capital', 'map', 'capital-country']) }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));
export const TRIP_LENGTH = 10;
/** A country counts as explored after this many correct answers about it. */
export const EXPLORED_AT = 2;
/** Correct answers in a trip for 3 and 2 stars. */
export const THREE_STARS_AT = 9;
export const TWO_STARS_AT = 7;

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
