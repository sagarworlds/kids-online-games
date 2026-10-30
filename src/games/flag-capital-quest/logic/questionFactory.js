import { GameError } from '../../../engine/utils/errors.js';
import { pick, shuffle } from '../../../engine/utils/random.js';
import { countriesFor, isCapitalOf } from './countries.js';
import { getLevel, TRIP_LENGTH, EXPLORED_AT } from './levels.js';

/**
 * @typedef {import('./levels.js').QuestionType} QuestionType
 * @typedef {{ code: string, label: string }} Option
 * @typedef {{
 *   type: QuestionType, code: string, options: Option[]
 * }} Question
 * `code` is the country the question is about and the right answer: every option has the code of a country, and the right
 * option is the one whose code is `code`. A map question is answered by tapping the map, and has options only as a fallback.
 */

const OPTION_COUNT = 4;

/** The text shown for a country on an answer button. */
const nameOption = (country) => ({ code: country.code, label: country.name });

/**
 * Three wrong countries from the *same continent* as the answer (so the choices are not too easy: a flag from the other
 * side of the world would be an obvious wrong one), never the answer itself and never two with the same name.
 *
 * @param {import('./countries.js').Country} answer
 * @param {readonly import('./countries.js').Country[]} all Every country; distractors may be of any level.
 * @param {() => number} rng
 * @param {(c: import('./countries.js').Country) => boolean} [usable] Extra condition, e.g. "has a capital".
 * @returns {import('./countries.js').Country[]}
 * @throws {GameError} 'NOT_ENOUGH_DISTRACTORS'
 */
export function pickDistractors(answer, all, rng, usable = () => true) {
  const pool = all.filter((c) => c.continent === answer.continent && c.code !== answer.code && c.name !== answer.name && usable(c));
  if (pool.length < OPTION_COUNT - 1) {
    throw new GameError('NOT_ENOUGH_DISTRACTORS', `${answer.continent} has too few countries to make choices for ${answer.name}`, { code: answer.code });
  }
  return shuffle(rng, pool).slice(0, OPTION_COUNT - 1);
}

/**
 * Builds one question of a type about a country.
 *
 * - `flag`: show the flag, choose the country's name.
 * - `capital`: show the country, choose its capital. The right button shows one of its capitals at random (so a country
 *   with several accepts any), and no wrong button shows any of the answer's capitals or repeats another button.
 * - `capital-country`: show a capital, choose the country.
 * - `map`: tap the country on the map (with name buttons as a fallback).
 *
 * @param {QuestionType} type
 * @param {import('./countries.js').Country} country
 * @param {readonly import('./countries.js').Country[]} all
 * @param {() => number} rng
 * @returns {Question}
 * @throws {GameError} 'BAD_QUESTION' for a type that cannot be asked about this country.
 */
export function makeQuestion(type, country, all, rng) {
  // A map question is answered by tapping the map. It also carries four buttons, for anyone who cannot use the map (a
  // keyboard or a screen reader), which the screen offers as "choose from a list instead".
  if (type === 'map' || type === 'flag') {
    return { type, code: country.code, options: shuffle(rng, [country, ...pickDistractors(country, all, rng)]).map(nameOption) };
  }
  if (country.capital.length === 0) throw new GameError('BAD_QUESTION', `${country.name} has no capital to ask about`, { code: country.code });
  if (type === 'capital-country') {
    const others = pickDistractors(country, all, rng, (c) => c.capital.length > 0);
    return { type, code: country.code, options: shuffle(rng, [country, ...others]).map(nameOption) };
  }
  if (type === 'capital') {
    const clash = (c) => c.capital.length > 0 && !c.capital.some((cap) => isCapitalOf(country, cap));
    const others = [];
    const seen = new Set(country.capital.map((c) => c.toLowerCase()));
    for (const c of pickDistractors(country, all, rng, clash)) {
      const label = c.capital[0];
      if (!seen.has(label.toLowerCase())) { seen.add(label.toLowerCase()); others.push({ code: c.code, label }); }
    }
    // A capital that appears twice ("Luxembourg" for the country and for another) would leave fewer than three; top up.
    for (const c of shuffle(rng, all.filter((x) => x.continent === country.continent && x.code !== country.code && clash(x)))) {
      if (others.length >= OPTION_COUNT - 1) break;
      const label = c.capital[0];
      if (!seen.has(label.toLowerCase())) { seen.add(label.toLowerCase()); others.push({ code: c.code, label }); }
    }
    return { type, code: country.code, options: shuffle(rng, [{ code: country.code, label: pick(rng, country.capital) }, ...others]) };
  }
  throw new GameError('BAD_QUESTION', `Unknown question type "${type}"`, { type });
}

/**
 * Which question types can be asked about a country: map questions need the country to be visible on the zoomed map,
 * and capital questions need a capital.
 * @param {readonly QuestionType[]} types
 * @param {import('./countries.js').Country} country
 * @param {(code: string) => boolean} canTap
 * @returns {QuestionType[]}
 */
export function typesFor(types, country, canTap) {
  return types.filter((type) => {
    if (type === 'map') return canTap(country.code);
    if (type === 'capital' || type === 'capital-country') return country.capital.length > 0;
    return true;
  });
}

/**
 * The questions of one trip.
 *
 * Countries come from the chosen continent (or the whole world) at the chosen level. Ones the child has not explored
 * yet come first, so a trip adds to the map; once those run out it carries on with explored ones. Never the same country
 * twice in a row, and each country at most once while there are enough to go round. Each question gets a random type from
 * those the level allows and the country supports.
 *
 * @param {{
 *   countries: readonly import('./countries.js').Country[], continent: import('./continents.js').Continent|'world',
 *   levelId: 'easy'|'medium'|'hard', progress: import('./progress.js').Progress, rng: () => number,
 *   canTap?: (code: string) => boolean, count?: number
 * }} options
 * @returns {Question[]}
 * @throws {GameError} 'NO_COUNTRIES' if nothing can be asked.
 */
export function buildTrip({ countries, continent, levelId, progress, rng, canTap = () => true, count = TRIP_LENGTH }) {
  const level = getLevel(levelId);
  const eligible = countriesFor(countries, level.countries, continent);
  if (eligible.length === 0) throw new GameError('NO_COUNTRIES', `No countries to ask about in ${continent} at ${levelId}`, { continent, levelId });

  const explored = (c) => (progress[c.code]?.correct ?? 0) >= EXPLORED_AT;
  const fresh = shuffle(rng, eligible.filter((c) => !explored(c)));
  const known = shuffle(rng, eligible.filter(explored));
  let queue = [...fresh, ...known];
  const targets = [];
  while (targets.length < count) {
    if (queue.length === 0) queue = shuffle(rng, eligible); // fewer countries than questions: go round again
    const index = queue.findIndex((c) => c.code !== targets[targets.length - 1]?.code);
    targets.push(queue.splice(index < 0 ? 0 : index, 1)[0]);
  }
  return targets.map((country) => {
    const types = typesFor(level.types, country, canTap);
    return makeQuestion(pick(rng, types.length ? types : ['flag']), country, countries, rng);
  });
}
