import { invalidData } from '../../../engine/utils/errors.js';
import { LEVELS, LEVEL_IDS } from './levels.js';
import { byId, canEat } from './organisms.js';
import { deriveEffects } from './whatIf.js';

/**
 * @typedef {import('./whatIf.js').Link} Link
 * @typedef {{ id: string, name: string, icon: string, ambient: string }} Place
 * @typedef {{
 *   id: string, place: string, name: string, level: import('./levels.js').LevelId, organisms: string[],
 *   required: Link[], allowed: Link[],
 *   whatIf?: { removed: string, effects: Record<string, import('./whatIf.js').Effect> }
 * }} Habitat  One puzzle: a place at one level. `required` links must be drawn; `allowed` ones are also correct.
 */

const FILE = 'habitats.json';
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const key = (l) => `${l.from}>${l.to}`;

/** Checks one list of links, naming where the first problem is. */
function checkLinks(links, at, habitat, lookup) {
  if (!Array.isArray(links)) invalidData(FILE, at, 'must be an array of { from, to }');
  const seen = new Set();
  links.forEach((link, i) => {
    const here = `${at}[${i}]`;
    for (const side of ['from', 'to']) {
      if (!habitat.organisms.includes(link?.[side])) invalidData(FILE, `${here}.${side}`, `"${link?.[side]}" is not an organism of ${habitat.id}`);
    }
    if (link.from === link.to) invalidData(FILE, here, `an organism cannot eat itself (${link.from})`);
    if (seen.has(key(link))) invalidData(FILE, here, `${key(link)} appears twice`);
    seen.add(key(link));
    const food = lookup.get(link.from);
    const eater = lookup.get(link.to);
    // Link direction is food -> eater, so a role mix-up (a hawk eating grass) is caught here, not by a child.
    if (!canEat(eater.role, food.role)) invalidData(FILE, here, `${eater.name} (${eater.role}) cannot eat ${food.name} (${food.role})`);
  });
}

/** True if following the links never leads back to where it started (energy only flows one way). */
function isAcyclic(ids, links) {
  const out = new Map(ids.map((id) => [id, []]));
  for (const l of links) out.get(l.from).push(l.to);
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === 1) return false;
    if (state.get(id) === 2) return true;
    state.set(id, 1);
    const ok = out.get(id).every(visit);
    state.set(id, 2);
    return ok;
  };
  return ids.every(visit);
}

/** The shape each level promises: a single chain, two chains that share something, or a web. */
function checkStructure(habitat) {
  const n = habitat.organisms.length;
  const links = habitat.required;
  const inCount = (id) => links.filter((l) => l.to === id).length;
  const outCount = (id) => links.filter((l) => l.from === id).length;
  const at = `habitats.${habitat.id}.required`;
  if (habitat.level === 'easy') {
    if (links.length !== n - 1 || habitat.organisms.some((id) => inCount(id) > 1 || outCount(id) > 1)) {
      invalidData(FILE, at, 'an Easy habitat must be a single chain (each organism has at most one food and one eater)');
    }
  } else if (habitat.level === 'medium') {
    if (!habitat.organisms.some((id) => inCount(id) > 1 || outCount(id) > 1)) invalidData(FILE, at, 'a Medium habitat needs two chains that share an organism');
    if (links.length < n - 1) invalidData(FILE, at, 'the chains must connect every organism');
  } else if (links.length < n) {
    invalidData(FILE, at, `a Hard food web needs at least as many links as organisms (${n})`);
  }
}

/**
 * Checks the habitats against the organisms. Besides the shape, it proves what the spec asks for and more: every link
 * only joins organisms of its own habitat; every link makes sense for the roles (herbivores eat only producers,
 * carnivores no plants, producers eat nothing); food only flows one way; every organism is part of the required
 * links; each level has the right number of organisms and the right structure; each place has all three levels; and the
 * "What if?" answers are exactly what the one-step rule gives.
 *
 * @param {any} data
 * @param {readonly import('./organisms.js').Organism[]} organisms
 * @returns {{ places: Place[], habitats: Habitat[] }}
 * @throws {import('../../../engine/utils/errors.js').GameError} 'INVALID_DATA'
 */
export function validateHabitats(data, organisms) {
  const lookup = byId(organisms);
  if (!Array.isArray(data?.places) || data.places.length === 0) invalidData(FILE, 'places', 'must be a non-empty array');
  const placeIds = new Set();
  data.places.forEach((p, i) => {
    const at = `places[${i}]`;
    for (const field of ['id', 'name', 'icon', 'ambient']) if (!isText(p?.[field])) invalidData(FILE, `${at}.${field}`, 'must be a non-empty string');
    if (placeIds.has(p.id)) invalidData(FILE, `${at}.id`, `"${p.id}" appears twice`);
    placeIds.add(p.id);
  });

  if (!Array.isArray(data.habitats) || data.habitats.length === 0) invalidData(FILE, 'habitats', 'must be a non-empty array');
  const ids = new Set();
  data.habitats.forEach((h, i) => {
    const at = `habitats[${i}]`;
    if (!isText(h?.id)) invalidData(FILE, `${at}.id`, 'must be a non-empty string');
    if (ids.has(h.id)) invalidData(FILE, `${at}.id`, `"${h.id}" appears twice`);
    ids.add(h.id);
    if (!placeIds.has(h.place)) invalidData(FILE, `${at}.place`, `"${h.place}" is not in places`);
    if (!LEVEL_IDS.includes(h.level)) invalidData(FILE, `${at}.level`, `must be one of ${LEVEL_IDS.join(', ')}`);
    if (h.id !== `${h.place}-${h.level}`) invalidData(FILE, `${at}.id`, `must be "${h.place}-${h.level}"`);
    if (!isText(h.name)) invalidData(FILE, `${at}.name`, 'must be a non-empty string');

    if (!Array.isArray(h.organisms) || new Set(h.organisms).size !== h.organisms.length) invalidData(FILE, `${at}.organisms`, 'must be a list without repeats');
    for (const id of h.organisms) if (!lookup.has(id)) invalidData(FILE, `${at}.organisms`, `"${id}" is not in organisms.json`);
    const [min, max] = LEVELS[h.level].organisms;
    if (h.organisms.length < min || h.organisms.length > max) invalidData(FILE, `${at}.organisms`, `a ${h.level} habitat has ${min} to ${max} organisms (found ${h.organisms.length})`);

    checkLinks(h.required, `${at}.required`, h, lookup);
    checkLinks(h.allowed, `${at}.allowed`, h, lookup);
    if (h.required.length === 0) invalidData(FILE, `${at}.required`, 'must have at least one link');
    const requiredKeys = new Set(h.required.map(key));
    h.allowed.forEach((l, j) => { if (requiredKeys.has(key(l))) invalidData(FILE, `${at}.allowed[${j}]`, `${key(l)} is already required`); });
    if (!isAcyclic(h.organisms, [...h.required, ...h.allowed])) invalidData(FILE, at, 'food must flow one way: the links form a loop');
    for (const id of h.organisms) {
      if (!h.required.some((l) => l.from === id || l.to === id)) invalidData(FILE, `${at}.organisms`, `"${id}" is in no required link`);
    }
    checkStructure(h);

    if (LEVELS[h.level].whatIf) {
      const w = h.whatIf;
      if (!w || !h.organisms.includes(w.removed)) invalidData(FILE, `${at}.whatIf.removed`, 'a Hard habitat needs a "What if?" with an organism of the habitat');
      const expected = deriveEffects(h, w.removed);
      for (const id of h.organisms) {
        if (id !== w.removed && w.effects?.[id] !== expected[id]) invalidData(FILE, `${at}.whatIf.effects.${id}`, `is "${w.effects?.[id]}" but the one-step rule gives "${expected[id]}"`);
      }
      if (Object.keys(w.effects).length !== h.organisms.length - 1) invalidData(FILE, `${at}.whatIf.effects`, 'must cover every organism except the removed one');
      const values = Object.values(expected);
      if (!values.includes('up') || !values.includes('down')) invalidData(FILE, `${at}.whatIf`, 'needs at least one "up" and one "down" answer to be worth asking');
    } else if (h.whatIf !== undefined) {
      invalidData(FILE, `${at}.whatIf`, `only ${LEVEL_IDS.filter((l) => LEVELS[l].whatIf).join(', ')} habitats have a "What if?"`);
    }
  });

  for (const place of data.places) {
    for (const level of LEVEL_IDS) {
      if (!data.habitats.some((h) => h.place === place.id && h.level === level)) invalidData(FILE, 'habitats', `${place.name} has no ${level} habitat`);
    }
  }
  return { places: data.places, habitats: data.habitats };
}

/** @param {readonly Habitat[]} habitats @param {string} placeId @param {string} level @returns {Habitat|undefined} */
export const findHabitat = (habitats, placeId, level) => habitats.find((h) => h.place === placeId && h.level === level);
