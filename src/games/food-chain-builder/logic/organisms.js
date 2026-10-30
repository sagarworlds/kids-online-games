import { invalidData } from '../../../engine/utils/errors.js';

/**
 * @typedef {'producer'|'herbivore'|'carnivore'|'omnivore'|'decomposer'} Role
 * @typedef {{
 *   id: string, name: string, plural: string, role: Role, icon: string, fact: string, diet?: string
 * }} Organism  `plural` is used in messages ("Frogs don't eat grass"); `diet` says what a consumer eats.
 */

const FILE = 'organisms.json';
export const ROLES = Object.freeze(['producer', 'herbivore', 'carnivore', 'omnivore', 'decomposer']);
const ID = /^[a-z][a-z]*$/;

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Checks the list of living things. Every one has a name, a plural, a role, a picture and a fact; anything that eats
 * (everything but a producer) also says what it eats, because the wrong-arrow message quotes it.
 *
 * @param {any} data
 * @returns {Organism[]}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validateOrganisms(data) {
  if (!Array.isArray(data?.organisms) || data.organisms.length === 0) invalidData(FILE, 'organisms', 'must be a non-empty array');
  const ids = new Set();
  data.organisms.forEach((o, i) => {
    const at = `organisms[${i}]`;
    if (typeof o?.id !== 'string' || !ID.test(o.id)) invalidData(FILE, `${at}.id`, 'must be a lowercase word');
    if (ids.has(o.id)) invalidData(FILE, `${at}.id`, `"${o.id}" appears twice`);
    ids.add(o.id);
    for (const field of ['name', 'plural', 'icon', 'fact']) if (!isText(o[field])) invalidData(FILE, `${at}.${field}`, 'must be a non-empty string');
    if (!ROLES.includes(o.role)) invalidData(FILE, `${at}.role`, `must be one of ${ROLES.join(', ')}`);
    if (o.role !== 'producer' && !isText(o.diet)) invalidData(FILE, `${at}.diet`, `must say what a ${o.role} eats`);
  });
  return data.organisms;
}

/** @template {{ id: string }} T @param {readonly T[]} items @returns {Map<string, T>} */
export const byId = (items) => new Map(items.map((item) => [item.id, item]));

/**
 * Can something with this role eat something with that role? Producers make their own food; herbivores eat only
 * producers; carnivores eat only animals; omnivores and decomposers eat anything. Used to check every link in the data,
 * so a typo cannot make a rabbit eat a fox's dinner or a hawk eat grass.
 *
 * @param {Role} eaterRole
 * @param {Role} foodRole
 * @returns {boolean}
 */
export function canEat(eaterRole, foodRole) {
  switch (eaterRole) {
    case 'producer': return false;
    case 'herbivore': return foodRole === 'producer';
    case 'carnivore': return foodRole !== 'producer';
    default: return true;
  }
}
