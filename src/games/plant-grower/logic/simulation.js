import { GameError } from '../../../engine/utils/errors.js';
import { NEEDS, MAX_NEED, STAGE_COUNT } from './plants.js';
import { DAYS, WEATHER, RAIN_WATER, HEAT_WATER_LOSS, CLOUD_CAP } from './weather.js';
import { dayMessage } from './messages.js';

/**
 * @typedef {import('./plants.js').Need} Need
 * @typedef {Record<Need, number>} Inputs  Slider values, whole numbers from 0 to 10.
 * @typedef {{
 *   day: number, inputs: Inputs, effective: Inputs, weather: import('./weather.js').Weather,
 *   scores: Record<Need, number>, healthChange: number, rawChange: number, health: number,
 *   stage: number, advanced: boolean, wilting: boolean, message: string
 * }} DayLog  `healthChange` is what really happened after the 0 to 100 limit; `rawChange` is the formula's number.
 * @typedef {{ day: number, health: number, stage: number, history: DayLog[] }} PlantState
 */

export { DAYS };
export const START_HEALTH = 70;
/** Health at the end of a day that lets the plant grow a stage, and the health below which it wilts. */
export const GROW_AT = 60;
export const WILT_BELOW = 30;
export const MAX_STAGE = STAGE_COUNT - 1;
/** A need counts as "near" the ideal range when it is no more than this far outside it. */
export const NEAR = 2;

/** @returns {PlantState} A new plant: a seed on day 0 with 70 health. */
export const createPlant = () => ({ day: 0, health: START_HEALTH, stage: 0, history: [] });

/**
 * How well one need is met: 1 inside the ideal range, 0.5 if no more than 2 outside it, otherwise 0.
 * @param {number} value
 * @param {readonly [number, number]} range [low, high]
 * @returns {0|0.5|1}
 */
export function needScore(value, [low, high]) {
  const distance = value < low ? low - value : value > high ? value - high : 0;
  if (distance === 0) return 1;
  return distance <= NEAR ? 0.5 : 0;
}

function checkInputs(inputs) {
  for (const need of NEEDS) {
    const value = inputs?.[need];
    if (!Number.isInteger(value) || value < 0 || value > MAX_NEED) {
      throw new GameError('BAD_INPUT', `${need} must be a whole number from 0 to ${MAX_NEED} (got ${value})`, { need, value });
    }
  }
}

/**
 * What the plant actually gets after the weather has had its say: rain adds 3 water (up to 10), a heat wave takes
 * 3 water away (down to 0), and clouds hold the sunlight to 4. Fertiliser is never changed by the weather.
 *
 * @param {Inputs} inputs
 * @param {import('./weather.js').Weather} weather
 * @returns {Inputs}
 * @throws {GameError} 'BAD_INPUT', 'BAD_WEATHER'
 */
export function effectiveInputs(inputs, weather) {
  checkInputs(inputs);
  if (!WEATHER[weather]) throw new GameError('BAD_WEATHER', `Unknown weather "${weather}"`, { weather });
  return {
    water: weather === 'rainy' ? Math.min(MAX_NEED, inputs.water + RAIN_WATER) : weather === 'heat' ? Math.max(0, inputs.water - HEAT_WATER_LOSS) : inputs.water,
    sun: weather === 'cloudy' ? Math.min(CLOUD_CAP, inputs.sun) : inputs.sun,
    food: inputs.food,
  };
}

/**
 * Lives one day.
 *
 * - Each need is scored 0, 0.5 or 1 against the plant's ideal range (see `needScore`), using the values after weather.
 * - Health changes by 10 × (sum of the three scores − 2), so all ideal is +10, two ideal and one missed is 0, and
 *   nothing right is −20. Health is then held between 0 and 100.
 * - If health is 60 or more at the end of the day the plant grows one stage; from 30 to 59 it stays as it is; under 30
 *   it wilts (the stage stays, and it can recover). The plant never dies.
 *
 * It is a pure function: the old state is not changed, and the same state, inputs, plant and weather always give the
 * same answer.
 *
 * @param {PlantState} state
 * @param {Inputs} inputs
 * @param {import('./plants.js').PlantType} plant
 * @param {import('./weather.js').Weather} weather
 * @returns {{ state: PlantState, log: DayLog }}
 * @throws {GameError} 'ALREADY_FINISHED' after day 7, 'BAD_INPUT', 'BAD_WEATHER'
 */
export function nextDay(state, inputs, plant, weather) {
  if (state.day >= DAYS) throw new GameError('ALREADY_FINISHED', `The plant has already grown for ${DAYS} days`, { day: state.day });
  const effective = effectiveInputs(inputs, weather);
  const scores = /** @type {Record<Need, number>} */ ({});
  let sum = 0;
  for (const need of NEEDS) {
    scores[need] = needScore(effective[need], plant.ideal[need]);
    sum += scores[need];
  }
  const rawChange = 10 * (sum - 2);
  const health = Math.min(100, Math.max(0, state.health + rawChange));
  const advanced = health >= GROW_AT && state.stage < MAX_STAGE;
  const stage = advanced ? state.stage + 1 : state.stage;

  /** @type {DayLog} */
  const log = {
    day: state.day + 1, inputs: { ...inputs }, effective, weather, scores,
    healthChange: health - state.health, rawChange, health, stage, advanced, wilting: health < WILT_BELOW, message: '',
  };
  log.message = dayMessage(log, plant);
  return { state: { day: log.day, health, stage, history: [...state.history, log] }, log };
}

/**
 * Stars after the last day: 80 health or more = 3, 60 or more = 2, otherwise 1. A plant never "dies"; with 1 star
 * the game says "Let's try again".
 * @param {number} health
 * @returns {1|2|3}
 */
export function starsForHealth(health) {
  if (health >= 80) return 3;
  if (health >= 60) return 2;
  return 1;
}

/** Score for the round: the final health plus 10 for each stage the plant reached. @param {PlantState} state */
export const roundScore = (state) => state.health + state.stage * 10;

/** @param {PlantState} state @returns {boolean} True after the seventh day. */
export const isFinished = (state) => state.day >= DAYS;
