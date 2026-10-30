/**
 * @typedef {'easy'|'medium'|'hard'} LevelId
 * @typedef {{
 *   id: LevelId, label: string, blurb: string, differences: number, objects: number,
 *   mutations: readonly string[], targetSeconds: number
 * }} LevelConfig
 *
 * `mutations` are mutation ids (see `logic/mutations`). Each level uses the ones before it and adds new ones.
 */

/** @type {Readonly<Record<LevelId, Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: '3 differences, 12 things', differences: 3, objects: 12, mutations: Object.freeze(['recolor', 'remove', 'add']), targetSeconds: 60 }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: '5 differences, 15 things', differences: 5, objects: 15, mutations: Object.freeze(['recolor', 'remove', 'add', 'resize', 'flip']), targetSeconds: 90 }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: '7 differences, 18 things', differences: 7, objects: 18, mutations: Object.freeze(['recolor', 'remove', 'add', 'resize', 'flip', 'move', 'rotate', 'subtle-recolor']), targetSeconds: 120 }),
});
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

export const SCENES_PER_ROUND = 5;
export const HINTS_PER_ROUND = 2;
/** After a miss, taps are ignored for this long, so tapping everywhere at random cannot find anything. */
export const COOLDOWN_MS = 300;
/** Each miss takes this many seconds off the time bonus. */
export const MISS_PENALTY_SECONDS = 3;

/** The size of every picture in scene units; both pictures share it, so taps mean the same place in each. */
export const SCENE_WIDTH = 800;
export const SCENE_HEIGHT = 500;

/** The key under which a theme's best stars at a level are saved. @param {string} themeId @param {string} levelId */
export const roundKey = (themeId, levelId) => `${themeId}-${levelId}`;
