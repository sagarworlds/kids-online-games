import { GameError, invalidData } from '../../../engine/utils/errors.js';
import { CONTINENT_IDS } from './continents.js';
import { LEVEL_IDS } from './levels.js';

/**
 * @typedef {{
 *   code: string, name: string, capital: string[], continent: import('./continents.js').Continent,
 *   flag: string, fact: string, level: 'easy'|'medium'|'hard', svgPathId: string
 * }} Country
 * `capital` lists every accepted capital (South Africa has three); it is empty for a country whose capital is disputed,
 * which is then never asked about as a capital. `svgPathId` is the id of the country's path in `assets/world.svg`.
 */

const FILE = 'countries.json';

/**
 * Checks the country list. It checks the shape and the things the game depends on: ISO-style two-letter codes that are
 * not repeated, a continent and level that exist, a flag path that matches the code, a one-sentence fact, and that the
 * map path id is the code. (A separate test checks that every flag file and map path really exists.)
 *
 * @param {any} data
 * @returns {{ countries: Country[] }}
 * @throws {GameError} 'INVALID_DATA' naming the field.
 */
export function validateCountries(data) {
  if (!Array.isArray(data?.countries) || data.countries.length === 0) invalidData(FILE, 'countries', 'must be a non-empty array');
  const codes = new Set();
  data.countries.forEach((c, i) => {
    const at = `countries[${i}]`;
    if (typeof c?.code !== 'string' || !/^[A-Z]{2}$/.test(c.code)) invalidData(FILE, `${at}.code`, 'must be two capital letters');
    if (codes.has(c.code)) invalidData(FILE, `${at}.code`, `"${c.code}" appears twice`);
    codes.add(c.code);
    if (typeof c.name !== 'string' || !c.name) invalidData(FILE, `${at}.name`, 'must be a non-empty string');
    if (!Array.isArray(c.capital) || c.capital.some((x) => typeof x !== 'string' || !x)) invalidData(FILE, `${at}.capital`, 'must be a list of names (empty if disputed)');
    if (!CONTINENT_IDS.includes(c.continent)) invalidData(FILE, `${at}.continent`, `must be one of ${CONTINENT_IDS.join(', ')}`);
    if (!LEVEL_IDS.includes(c.level)) invalidData(FILE, `${at}.level`, 'must be easy, medium or hard');
    if (c.flag !== `assets/flags/${c.code.toLowerCase()}.svg`) invalidData(FILE, `${at}.flag`, `must be assets/flags/${c.code.toLowerCase()}.svg`);
    if (c.svgPathId !== c.code) invalidData(FILE, `${at}.svgPathId`, 'must be the country code');
    if (typeof c.fact !== 'string' || c.fact.length < 20 || !/[.!]$/.test(c.fact)) invalidData(FILE, `${at}.fact`, 'must be one sentence ending in a full stop');
  });
  return data;
}

/**
 * The countries a level asks about: Medium takes Easy and Medium countries, Hard takes every country.
 * @param {readonly Country[]} countries
 * @param {readonly string[]} levels The country levels the quiz level includes.
 * @param {import('./continents.js').Continent|'world'} [continent]
 * @returns {Country[]}
 */
export function countriesFor(countries, levels, continent = 'world') {
  return countries.filter((c) => levels.includes(c.level) && (continent === 'world' || c.continent === continent));
}

/** @param {readonly Country[]} countries @returns {Map<string, Country>} */
export const byCode = (countries) => new Map(countries.map((c) => [c.code, c]));

/**
 * Is `text` an accepted capital of the country? Any listed capital counts, in any capitalisation.
 * @param {Country} country
 * @param {string} text
 * @returns {boolean}
 */
export function isCapitalOf(country, text) {
  const wanted = String(text).trim().toLowerCase();
  return country.capital.some((c) => c.toLowerCase() === wanted);
}

/** @param {string} code @param {Map<string, Country>} index @returns {Country} @throws {GameError} 'UNKNOWN_COUNTRY' */
export function getCountry(code, index) {
  const country = index.get(code);
  if (!country) throw new GameError('UNKNOWN_COUNTRY', `There is no country "${code}"`, { code });
  return country;
}
