import { NEEDS } from './plants.js';
import { WEATHER } from './weather.js';

/**
 * @typedef {import('./plants.js').Need} Need
 * @typedef {'low'|'ok'|'high'} Direction
 * @typedef {{ need: Need, value: number, range: readonly [number, number], score: number, distance: number, direction: Direction }} Diagnosis
 * @typedef {{ id: string, icon: string, bubble: string, message: string }} Problem
 */

export const NEED_LABELS = Object.freeze({ water: 'Water', sun: 'Sunlight', food: 'Fertiliser' });

/**
 * What the plant says, and what is going on, for each way a need can go wrong.
 * @type {Readonly<Record<string, Problem>>}
 */
export const PROBLEMS = Object.freeze({
  'water-low': { id: 'thirsty', icon: '💧', bubble: "I'm thirsty!", message: 'The soil is too dry. I need more water!' },
  'water-high': { id: 'puddle', icon: '💦', bubble: 'Too much water!', message: 'There is a puddle: too much water makes my roots soggy.' },
  'sun-low': { id: 'shady', icon: '☁️', bubble: 'I need more sunlight!', message: "It is too dark for me. I need more sunlight to make food." },
  'sun-high': { id: 'sweaty', icon: '🥵', bubble: "It's too hot!", message: 'Too much sun makes me sweat and dry out.' },
  'food-low': { id: 'hungry', icon: '🍽️', bubble: "I'm hungry!", message: 'There are not enough nutrients in the soil. I need some fertiliser!' },
  'food-high': { id: 'burnt', icon: '😖', bubble: 'Too much fertiliser!', message: 'Too much fertiliser burns my roots.' },
});
export const HAPPY = Object.freeze({ id: 'happy', icon: '😊', bubble: 'I feel great!', message: 'Everything was just right. I feel great!' });

/**
 * For each need, how it compares with the ideal range.
 * @param {Record<Need, number>} effective The values after weather.
 * @param {{ ideal: Record<Need, [number, number]> }} plant
 * @param {Record<Need, number>} scores From `needScore`.
 * @returns {Diagnosis[]}
 */
export function diagnose(effective, plant, scores) {
  return NEEDS.map((need) => {
    const [low, high] = plant.ideal[need];
    const value = effective[need];
    const direction = value < low ? 'low' : value > high ? 'high' : 'ok';
    return { need, value, range: plant.ideal[need], score: scores[need], distance: direction === 'low' ? low - value : direction === 'high' ? value - high : 0, direction };
  });
}

/**
 * The need to talk about: the lowest score, and among equals the one furthest from its range, and among those the
 * first of water, sunlight, fertiliser (so the answer is always the same).
 * @param {readonly Diagnosis[]} diagnosis
 * @returns {Diagnosis|null} Null when every need was just right.
 */
export function worstNeed(diagnosis) {
  const problems = diagnosis.filter((d) => d.direction !== 'ok');
  if (problems.length === 0) return null;
  return problems.reduce((worst, d) => (d.score < worst.score || (d.score === worst.score && d.distance > worst.distance) ? d : worst));
}

/** @param {Diagnosis|null} worst @returns {Problem} */
export const problemFor = (worst) => (worst ? PROBLEMS[`${worst.need}-${worst.direction}`] : HAPPY);

/**
 * The kid-friendly sentence for a day, from its worst need.
 * @param {{ effective: Record<Need, number>, scores: Record<Need, number> }} log
 * @param {{ ideal: Record<Need, [number, number]> }} plant
 * @returns {string}
 */
export function dayMessage(log, plant) {
  return problemFor(worstNeed(diagnose(log.effective, plant, log.scores))).message;
}

/**
 * The full reason for a day, for the journal: one sentence for each need, with the numbers and what the plant likes, and
 * a note for weather that changed what the plant received.
 *
 * @param {import('./simulation.js').DayLog} log
 * @param {{ ideal: Record<Need, [number, number]> }} plant
 * @returns {string[]}
 */
export function explainDay(log, plant) {
  const lines = [];
  for (const d of diagnose(log.effective, plant, log.scores)) {
    const label = NEED_LABELS[d.need];
    const likes = `this plant likes ${d.range[0] === d.range[1] ? d.range[0] : `${d.range[0]} to ${d.range[1]}`}`;
    const changed = log.inputs[d.need] !== d.value ? ` (you set ${log.inputs[d.need]}, the weather made it ${d.value})` : '';
    if (d.direction === 'ok') lines.push(`${label} was ${d.value}${changed}: just right.`);
    else lines.push(`${label} was ${d.value}${changed}, but ${likes}: ${d.need === 'water' ? (d.direction === 'low' ? 'too dry' : 'too wet') : d.need === 'sun' ? (d.direction === 'low' ? 'too dark' : 'too bright') : (d.direction === 'low' ? 'too little' : 'too much')}.`);
  }
  if (log.weather !== 'sunny') lines.push(`${WEATHER[log.weather].label}: ${WEATHER[log.weather].effect}`);
  return lines;
}
