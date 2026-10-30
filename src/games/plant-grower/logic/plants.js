import { invalidData } from '../../../engine/utils/errors.js';
import { LEVEL_IDS } from './levels.js';

/**
 * @typedef {'water'|'sun'|'food'} Need
 * @typedef {{
 *   id: string, name: string, icon: string, unlock: import('./levels.js').LevelId,
 *   ideal: Record<Need, [number, number]>, stages: string[], fact: string
 * }} PlantType  `stages` has a name for each stage from the seed (0) to the finished plant (7).
 */

const FILE = 'plants.json';
/** Sliders go from 0 to 10. */
export const MAX_NEED = 10;
/** A plant grows over 7 days, so it has the seed stage plus one stage for each day. */
export const STAGE_COUNT = 8;
export const NEEDS = Object.freeze(['water', 'sun', 'food']);
const ID = /^[a-z]+$/;

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Checks the plant file. Each plant has an ideal range for water, sunlight and fertiliser inside the slider's 0 to 10,
 * eight stage names, a fact and the level at which its seed becomes available.
 *
 * @param {any} data
 * @returns {PlantType[]}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validatePlants(data) {
  if (!Array.isArray(data?.plants) || data.plants.length === 0) invalidData(FILE, 'plants', 'must be a non-empty array');
  const ids = new Set();
  data.plants.forEach((plant, i) => {
    const at = `plants[${i}]`;
    if (typeof plant?.id !== 'string' || !ID.test(plant.id)) invalidData(FILE, `${at}.id`, 'must be a lowercase word');
    if (ids.has(plant.id)) invalidData(FILE, `${at}.id`, `"${plant.id}" appears twice`);
    ids.add(plant.id);
    for (const field of ['name', 'icon', 'fact']) if (!isText(plant[field])) invalidData(FILE, `${at}.${field}`, 'must be a non-empty string');
    if (!LEVEL_IDS.includes(plant.unlock)) invalidData(FILE, `${at}.unlock`, `must be one of ${LEVEL_IDS.join(', ')}`);
    for (const need of NEEDS) {
      const range = plant.ideal?.[need];
      if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_NEED) || range[0] > range[1]) {
        invalidData(FILE, `${at}.ideal.${need}`, `must be [low, high] whole numbers from 0 to ${MAX_NEED}, low not above high`);
      }
    }
    if (!Array.isArray(plant.stages) || plant.stages.length !== STAGE_COUNT || !plant.stages.every(isText)) {
      invalidData(FILE, `${at}.stages`, `must name exactly ${STAGE_COUNT} stages, from seed to finished plant`);
    }
  });
  if (!data.plants.some((p) => p.unlock === 'easy')) invalidData(FILE, 'plants', 'needs a plant for the Easy level');
  return data.plants;
}

/**
 * The seeds a level offers: every plant whose level is this one or an easier one (Easy sunflower; Medium adds tomato
 * and cactus; Hard adds rice).
 * @param {readonly PlantType[]} plants
 * @param {import('./levels.js').LevelId} levelId
 * @returns {PlantType[]}
 */
export const plantsFor = (plants, levelId) => plants.filter((p) => LEVEL_IDS.indexOf(p.unlock) <= LEVEL_IDS.indexOf(levelId));
