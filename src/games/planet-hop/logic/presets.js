import { GameError, invalidData } from '../../../engine/utils/errors.js';
import { parseWeight } from './weight.js';

/** @typedef {{ id: string, label: string, icon: string, kg: number }} Preset  A weight to try instead of typing one ("a 20 kg dog"). */

const FILE = 'presets.json';

/**
 * Checks the list of toys and animals that can stand in for the child's weight, so a preset can never be a weight the
 * weigh-in would refuse.
 *
 * @param {any} data
 * @returns {Preset[]}
 * @throws {GameError} 'INVALID_DATA'
 */
export function validatePresets(data) {
  if (!Array.isArray(data?.presets) || data.presets.length === 0) invalidData(FILE, 'presets', 'must be a non-empty array');
  const ids = new Set();
  data.presets.forEach((preset, i) => {
    const at = `presets[${i}]`;
    if (typeof preset?.id !== 'string' || !preset.id) invalidData(FILE, `${at}.id`, 'must be a non-empty string');
    if (ids.has(preset.id)) invalidData(FILE, `${at}.id`, `"${preset.id}" appears twice`);
    ids.add(preset.id);
    if (typeof preset.label !== 'string' || !preset.label) invalidData(FILE, `${at}.label`, 'must be a non-empty string');
    if (typeof preset.icon !== 'string' || !preset.icon) invalidData(FILE, `${at}.icon`, 'must be a non-empty string');
    try {
      parseWeight(preset.kg);
    } catch (error) {
      if (error instanceof GameError && error.code === 'BAD_WEIGHT') invalidData(FILE, `${at}.kg`, `must be a weight the weigh-in accepts (${error.message})`);
      throw error;
    }
  });
  return data.presets;
}
