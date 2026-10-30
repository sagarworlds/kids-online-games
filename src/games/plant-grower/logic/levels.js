/**
 * @typedef {'easy'|'medium'|'hard'} LevelId
 * @typedef {{
 *   id: LevelId, label: string, blurb: string,
 *   showRanges: boolean, hints: 'full'|'bubble'|'none',
 *   weather: { rain: number, cloud: number, heatDays: number }
 * }} LevelConfig
 *
 * `showRanges`: the ideal range is marked on each slider (Easy only).
 * `hints`: 'full' = the plant says what is wrong and the day card explains why; 'bubble' = only the plant's thought
 * bubble; 'none' = no hints while growing, the journal explains afterwards (Hard).
 * `weather`: how many rainy days, cloudy days and heat-wave days (always back to back) the week has.
 */

/** @type {Readonly<Record<LevelId, Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'Sunflower, no weather, ideal ranges shown', showRanges: true, hints: 'full', weather: Object.freeze({ rain: 0, cloud: 0, heatDays: 0 }) }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'More seeds, rain and clouds, a hint bubble', showRanges: false, hints: 'bubble', weather: Object.freeze({ rain: 1, cloud: 1, heatDays: 0 }) }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Rice too, a heat wave, no hints', showRanges: false, hints: 'none', weather: Object.freeze({ rain: 1, cloud: 1, heatDays: 2 }) }),
});
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/** Stars are saved per plant and level, so Easy sunflower and Hard sunflower keep separate bests. */
export const roundKey = (plantId, levelId) => `${plantId}-${levelId}`;
