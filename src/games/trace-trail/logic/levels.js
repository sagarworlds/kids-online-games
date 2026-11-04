import { GameError } from '../../../engine/utils/errors.js';
import { sample } from '../../../engine/utils/random.js';
import { starsForAccuracy } from '../../../engine/utils/stars.js';
import { SETS } from './glyphs/index.js';

/**
 * @typedef {'easy'|'medium'|'hard'} LevelId
 * @typedef {{ id: LevelId, label: string, blurb: string, setIds: readonly string[], tolerance: number, perRound: number }} LevelConfig
 * `tolerance` is how far from the path (in drawing units, a letter is 90 tall) the pencil may be and still count; `perRound`
 * is how many glyphs make a round.
 */

/** @type {Readonly<Record<LevelId, Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'Lines, curves and numbers', setIds: Object.freeze(['strokes', 'numbers']), tolerance: 14, perRound: 5 }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'Letters', setIds: Object.freeze(['capitals', 'small', 'devanagari']), tolerance: 11, perRound: 5 }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Syllables and words', setIds: Object.freeze(['words-en', 'words-dev']), tolerance: 9, perRound: 3 }),
});
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/** The key under which the best stars for a set are saved. @param {string} setId */
export const roundKey = (setId) => `trace-${setId}`;

/**
 * The glyphs of a round: different ones from the set, in a random order.
 * @param {string} setId
 * @param {number} count
 * @param {() => number} rng
 * @returns {import('./glyphs/define.js').Glyph[]}
 * @throws {GameError} 'UNKNOWN_SET'
 */
export function pickGlyphs(setId, count, rng) {
  const set = SETS[setId];
  if (!set) throw new GameError('UNKNOWN_SET', `There is no set "${setId}"`, { setId });
  return sample(rng, set.glyphs, Math.min(count, set.glyphs.length));
}

/**
 * Stars for one glyph from its tracing score (0 to 1): the shared 90% and 70% rules.
 * @param {number} score
 * @returns {1|2|3}
 */
export const glyphStars = (score) => starsForAccuracy(score);

/**
 * Stars for a round: the average of its glyphs, a half rounded up.
 * @param {readonly { stars: number }[]} results
 * @returns {number} 0 if there are none.
 */
export function roundStars(results) {
  if (results.length === 0) return 0;
  return Math.floor(results.reduce((sum, r) => sum + r.stars, 0) / results.length + 0.5);
}

/** Even on a small screen the path is at least this wide to hit, in screen pixels, so a finger or a thick stylus can follow it. */
export const MIN_TOLERANCE_PX = 16;

/**
 * How far from the path the pencil may be, in drawing units: the level's tolerance, or wider if that would be narrower than
 * MIN_TOLERANCE_PX on this screen (a long word shrinks to fit a phone).
 * @param {{ tolerance: number }} level
 * @param {number} scale Screen pixels for each drawing unit.
 * @returns {number}
 */
export function effectiveTolerance(level, scale) {
  return scale > 0 ? Math.max(level.tolerance, MIN_TOLERANCE_PX / scale) : level.tolerance;
}
