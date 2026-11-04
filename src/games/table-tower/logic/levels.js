import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {'easy'|'medium'|'hard'} LevelId
 * @typedef {{
 *   id: LevelId, label: string, blurb: string, firstFloor: number, lastFloor: number,
 *   answerMode: 'choice'|'typed', secondsPerQuestion: number, questions: number, hiddenFactorShare: number
 * }} LevelConfig
 */

/** Number of floors in the tower: one for each times table from 1 to 30. */
export const FLOORS = 30;
/** Each floor's table is practised from 1 to 10 times. */
export const FACTS_PER_FLOOR = 10;
/** Stars needed in the Challenge to clear a floor and open the next one. */
export const CLEAR_STARS = 2;

/** @type {Readonly<Record<LevelId, Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'Floors 1 to 10', firstFloor: 1, lastFloor: 10, answerMode: 'choice', secondsPerQuestion: 8, questions: 12, hiddenFactorShare: 0 }),
  medium: Object.freeze({ id: 'medium', label: 'Medium', blurb: 'Floors 11 to 20', firstFloor: 11, lastFloor: 20, answerMode: 'typed', secondsPerQuestion: 10, questions: 12, hiddenFactorShare: 0 }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Floors 21 to 30', firstFloor: 21, lastFloor: 30, answerMode: 'typed', secondsPerQuestion: 14, questions: 12, hiddenFactorShare: 0.25 }),
});
export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/** @param {unknown} floor @returns {boolean} A whole number from 1 to 30. */
export const isFloor = (floor) => Number.isInteger(floor) && floor >= 1 && floor <= FLOORS;

/**
 * Which level a floor belongs to (1 to 10 is Easy, 11 to 20 Medium, 21 to 30 Hard).
 * @param {number} floor
 * @returns {LevelConfig}
 * @throws {GameError} 'BAD_FLOOR'
 */
export function levelOfFloor(floor) {
  const level = Object.values(LEVELS).find((l) => floor >= l.firstFloor && floor <= l.lastFloor);
  if (!level) throw new GameError('BAD_FLOOR', `There is no floor ${floor}`, { floor });
  return level;
}

/** @param {LevelConfig} level @returns {number[]} Its floors from the lowest up. */
export const floorsOf = (level) => Array.from({ length: level.lastFloor - level.firstFloor + 1 }, (_, i) => level.firstFloor + i);

/** The time allowed for a whole Challenge at this level, in seconds. @param {LevelConfig} level */
export const challengeSeconds = (level) => level.questions * level.secondsPerQuestion;

/** The keys under which a floor's best stars are saved. @param {number} floor */
export const floorKey = (floor) => `floor-${floor}`;
export const ladderKey = (floor) => `ladder-${floor}`;
/** @param {string} levelId */
export const revisionKey = (levelId) => `revision-${levelId}`;

/**
 * Which floors are open. The first floor of each level is always open (you pick a level to start there); every other
 * floor opens when the floor below it is cleared in the Challenge.
 * @param {number} floor
 * @param {ReadonlySet<number>} cleared Floors cleared so far.
 * @returns {boolean}
 */
export function isFloorOpen(floor, cleared) {
  const level = levelOfFloor(floor);
  return floor === level.firstFloor || cleared.has(floor - 1);
}

/**
 * The floors cleared according to the saved best stars (a floor counts at CLEAR_STARS or more).
 * @param {Record<string, number>} bestStars
 * @returns {Set<number>}
 */
export function clearedFloors(bestStars) {
  const cleared = new Set();
  for (let floor = 1; floor <= FLOORS; floor++) if ((bestStars[floorKey(floor)] ?? 0) >= CLEAR_STARS) cleared.add(floor);
  return cleared;
}
