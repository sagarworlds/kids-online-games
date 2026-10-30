import { GameError } from '../../../engine/utils/errors.js';
import { shuffle, randInt } from '../../../engine/utils/random.js';
import { LEVELS } from './levels.js';

/** @typedef {'sunny'|'rainy'|'cloudy'|'heat'} Weather */

export const DAYS = 7;
/** Rain adds this much water, a heat wave takes this much away, and clouds hold the sunlight to at most CLOUD_CAP. */
export const RAIN_WATER = 3;
export const HEAT_WATER_LOSS = 3;
export const CLOUD_CAP = 4;

/** @type {Readonly<Record<Weather, { icon: string, label: string, because: string, effect: string }>>} */
export const WEATHER = Object.freeze({
  sunny: Object.freeze({ icon: '☀️', label: 'Sunny', because: 'it is sunny', effect: 'A normal day.' }),
  rainy: Object.freeze({ icon: '🌧️', label: 'Rainy', because: 'it is rainy', effect: `The rain adds ${RAIN_WATER} water to the soil by itself.` }),
  cloudy: Object.freeze({ icon: '☁️', label: 'Cloudy', because: 'it is cloudy', effect: `Clouds hide the sun, so the plant gets no more than ${CLOUD_CAP} sunlight.` }),
  heat: Object.freeze({ icon: '🔥', label: 'Heat wave', because: 'there is a heat wave', effect: `The heat dries the soil: ${HEAT_WATER_LOSS} of the water is lost, so give more.` }),
});

/**
 * The week's weather, worked out before the first day from a seeded random source, so the same seed always gives the
 * same week. Easy has none (seven sunny days). Medium has one rainy and one cloudy day. Hard adds a heat wave of two
 * days in a row. Every event lands on a different day.
 *
 * @param {import('../../../engine/utils/random.js').Rng} rng
 * @param {import('./levels.js').LevelId} levelId
 * @returns {Weather[]} One entry for each of the 7 days.
 * @throws {GameError} 'BAD_LEVEL'
 */
export function createWeather(rng, levelId) {
  const level = LEVELS[levelId];
  if (!level) throw new GameError('BAD_LEVEL', `Unknown level "${levelId}"`, { levelId });
  const days = /** @type {Weather[]} */ (Array(DAYS).fill('sunny'));
  const free = new Set(Array.from({ length: DAYS }, (_, i) => i));
  const { rain, cloud, heatDays } = level.weather;

  if (heatDays > 0) {
    const start = randInt(rng, 0, DAYS - heatDays);
    for (let i = start; i < start + heatDays; i++) { days[i] = 'heat'; free.delete(i); }
  }
  const order = shuffle(rng, [...free]);
  for (let i = 0; i < rain; i++) days[order.pop()] = 'rainy';
  for (let i = 0; i < cloud; i++) days[order.pop()] = 'cloudy';
  return days;
}
