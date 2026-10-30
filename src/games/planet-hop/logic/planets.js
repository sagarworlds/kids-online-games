import { GameError, invalidData } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: string, name: string, order: number, gravity: number, color: string, radiusKm: number,
 *   distanceAU: number, fact: string, look: string
 * }} Planet  `gravity` is relative to Earth (Earth = 1). `look` completes "Mars is the 4th planet, ___".
 * @typedef {{
 *   id: string, name: string, orbits: string, gravity: number, color: string, radiusKm: number, fact: string, look: string
 * }} Bonus  A body that is not a planet but can be visited on the weigh-in (the Moon).
 * @typedef {{ planets: Planet[], bonus: Bonus[] }} PlanetData
 */

const FILE = 'planets.json';
const COLOR = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z][a-z-]*$/;

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
/** Gravity has at most two decimals so felt weights can be worked out in whole numbers (see `feltWeight`). */
const hasTwoDecimals = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;

function checkBody(body, at, ids) {
  if (typeof body?.id !== 'string' || !ID.test(body.id)) invalidData(FILE, `${at}.id`, 'must be a lowercase word');
  if (ids.has(body.id)) invalidData(FILE, `${at}.id`, `"${body.id}" appears twice`);
  ids.add(body.id);
  if (!isText(body.name)) invalidData(FILE, `${at}.name`, 'must be a non-empty string');
  if (!isPositive(body.gravity) || body.gravity > 5) invalidData(FILE, `${at}.gravity`, 'must be a number above 0 and up to 5');
  if (!hasTwoDecimals(body.gravity)) invalidData(FILE, `${at}.gravity`, 'must have at most two decimals');
  if (typeof body.color !== 'string' || !COLOR.test(body.color)) invalidData(FILE, `${at}.color`, 'must be a colour like #aabbcc');
  if (!isPositive(body.radiusKm)) invalidData(FILE, `${at}.radiusKm`, 'must be a positive number');
  if (!isText(body.fact)) invalidData(FILE, `${at}.fact`, 'must be a non-empty string');
  if (!isText(body.look)) invalidData(FILE, `${at}.look`, 'must be a non-empty string');
}

/**
 * Checks the planet file: every planet has what the game needs, the orbit numbers run 1, 2, 3... with no gap or repeat
 * and the distances grow with them (so "closest to the Sun" and the order can never disagree), and each bonus body
 * orbits a planet that exists. Returns the planets sorted by orbit.
 *
 * @param {any} data
 * @returns {PlanetData}
 * @throws {GameError} 'INVALID_DATA'
 */
export function validatePlanets(data) {
  if (!Array.isArray(data?.planets) || data.planets.length < 2) invalidData(FILE, 'planets', 'must be an array of at least two planets');
  const ids = new Set();
  data.planets.forEach((planet, i) => {
    const at = `planets[${i}]`;
    checkBody(planet, at, ids);
    if (!Number.isInteger(planet.order)) invalidData(FILE, `${at}.order`, 'must be a whole number');
    if (!isPositive(planet.distanceAU)) invalidData(FILE, `${at}.distanceAU`, 'must be a positive number');
  });
  const planets = [...data.planets].sort((a, b) => a.order - b.order);
  planets.forEach((planet, i) => {
    if (planet.order !== i + 1) invalidData(FILE, 'planets', `orbit numbers must be 1 to ${planets.length} with none missing or repeated (found ${planet.order} at place ${i + 1})`);
    if (i > 0 && planet.distanceAU <= planets[i - 1].distanceAU) invalidData(FILE, `planets.${planet.id}.distanceAU`, 'must be farther from the Sun than the planet before it');
  });
  const bonus = data.bonus ?? [];
  if (!Array.isArray(bonus)) invalidData(FILE, 'bonus', 'must be an array');
  bonus.forEach((body, i) => {
    const at = `bonus[${i}]`;
    checkBody(body, at, ids);
    if (!planets.some((p) => p.id === body.orbits)) invalidData(FILE, `${at}.orbits`, `"${body.orbits}" is not a planet in this file`);
  });
  return { planets, bonus: [...bonus] };
}

/** @template {{ id: string }} T @param {readonly T[]} bodies @returns {Map<string, T>} */
export const byId = (bodies) => new Map(bodies.map((b) => [b.id, b]));

/**
 * Every place the rocket can go on the weigh-in: the planets in order, with each bonus body right after the planet it
 * orbits (the Moon after Earth).
 * @param {PlanetData} data
 * @returns {(Planet|Bonus)[]}
 */
export function weighStops({ planets, bonus }) {
  return planets.flatMap((planet) => [planet, ...bonus.filter((b) => b.orbits === planet.id)]);
}

/**
 * @param {number} n A whole number from 1.
 * @returns {string} "1st", "2nd", "3rd", "4th", "11th", "12th", "21st"...
 * @throws {GameError} 'BAD_NUMBER' unless n is a whole number of 1 or more.
 */
export function ordinal(n) {
  if (!Number.isInteger(n) || n < 1) throw new GameError('BAD_NUMBER', `ordinal needs a whole number from 1 (got ${n})`, { n });
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}
