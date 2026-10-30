/**
 * @typedef {'easy'|'medium'|'hard'} LevelId
 * @typedef {{
 *   id: LevelId, label: string, blurb: string, showRoles: boolean, whatIf: boolean, organisms: readonly [number, number]
 * }} LevelConfig
 *
 * `showRoles`: Easy cards say what each living thing is (Producer, Herbivore...); Medium and Hard hide it, so the child
 * has to know. `whatIf`: Hard ends with the "What if?" challenge. `organisms` is how many cards a habitat has (min, max).
 */

/** @type {Readonly<Record<LevelId, Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'One food chain, cards show what they are', showRoles: true, whatIf: false, organisms: Object.freeze([3, 4]) }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'Two chains that share an animal or plant', showRoles: false, whatIf: false, organisms: Object.freeze([5, 6]) }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'A whole food web, then "What if?"', showRoles: false, whatIf: true, organisms: Object.freeze([7, 8]) }),
});
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/** After this many Checks that still leave arrows missing, the game points at who is missing a link. */
export const HINT_AFTER_CHECKS = 2;
