import { GameError, invalidData } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { LEVEL_IDS } from './levels.js';

/**
 * @typedef {{
 *   id: string, level: 'easy'|'medium'|'hard', kind: 'planet'|'text', q: string, answerId: string, optionIds: string[],
 *   explain: string, basedOn?: object
 * }} QuizItem
 * For `kind: 'planet'` the answer and options are planet ids (shown as pictures); for `kind: 'text'` they are the words shown.
 * `basedOn` ties a question to the planet data so the two cannot disagree: `{ field, extreme: 'min'|'max' }`,
 * `{ field, equals }` or `{ planetCount: true }`.
 */

const FILE = 'quiz.json';
const MIN_PER_LEVEL = 10;
const MIN_OPTIONS = 3;

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Checks a `basedOn` rule against the planets, naming the question if the data and the rule disagree. */
function checkBasedOn(item, at, planets) {
  const rule = item.basedOn;
  if (rule.planetCount) {
    if (item.answerId !== String(planets.length)) invalidData(FILE, `${at}.answerId`, `is "${item.answerId}" but the planet file has ${planets.length} planets`);
    return;
  }
  const planet = planets.find((p) => p.id === item.answerId);
  if (!planet || typeof planet[rule.field] !== 'number') invalidData(FILE, `${at}.basedOn.field`, `"${rule.field}" is not a number on planet "${item.answerId}"`);
  if ('equals' in rule) {
    if (planet[rule.field] !== rule.equals) invalidData(FILE, `${at}.answerId`, `"${planet.id}" has ${rule.field} ${planet[rule.field]}, not ${rule.equals}`);
    return;
  }
  if (rule.extreme !== 'min' && rule.extreme !== 'max') invalidData(FILE, `${at}.basedOn.extreme`, 'must be "min" or "max"');
  const values = planets.map((p) => p[rule.field]);
  const best = rule.extreme === 'max' ? Math.max(...values) : Math.min(...values);
  const winners = planets.filter((p) => p[rule.field] === best);
  if (winners.length !== 1 || winners[0].id !== item.answerId) {
    invalidData(FILE, `${at}.answerId`, `must be the one planet with the ${rule.extreme === 'max' ? 'largest' : 'smallest'} ${rule.field} (${winners.map((p) => p.id).join(', ')})`);
  }
}

/**
 * Checks the quiz file, including against the planet data: planet questions name real planets, every answer is among
 * its options, questions that claim to follow from the planet data really do (so "the biggest planet" cannot be edited
 * to say Saturn), and each level has enough questions of its own for a 10-question round.
 *
 * @param {any} data
 * @param {readonly import('./planets.js').Planet[]} planets
 * @returns {QuizItem[]}
 * @throws {GameError} 'INVALID_DATA'
 */
export function validateQuiz(data, planets) {
  if (!Array.isArray(data?.questions) || data.questions.length === 0) invalidData(FILE, 'questions', 'must be a non-empty array');
  const ids = new Set();
  const texts = new Set();
  const planetIds = new Set(planets.map((p) => p.id));
  data.questions.forEach((item, i) => {
    const at = `questions[${i}]`;
    if (!isText(item?.id)) invalidData(FILE, `${at}.id`, 'must be a non-empty string');
    if (ids.has(item.id)) invalidData(FILE, `${at}.id`, `"${item.id}" appears twice`);
    ids.add(item.id);
    if (!LEVEL_IDS.includes(item.level)) invalidData(FILE, `${at}.level`, `must be one of ${LEVEL_IDS.join(', ')}`);
    if (item.kind !== 'planet' && item.kind !== 'text') invalidData(FILE, `${at}.kind`, 'must be "planet" or "text"');
    if (!isText(item.q)) invalidData(FILE, `${at}.q`, 'must be a non-empty string');
    if (texts.has(item.q)) invalidData(FILE, `${at}.q`, 'is asked twice');
    texts.add(item.q);
    if (!isText(item.explain)) invalidData(FILE, `${at}.explain`, 'must be a non-empty string');
    if (!Array.isArray(item.optionIds) || item.optionIds.length < MIN_OPTIONS || !item.optionIds.every(isText)) {
      invalidData(FILE, `${at}.optionIds`, `must list at least ${MIN_OPTIONS} non-empty options`);
    }
    if (new Set(item.optionIds).size !== item.optionIds.length) invalidData(FILE, `${at}.optionIds`, 'has a repeated option');
    if (!item.optionIds.includes(item.answerId)) invalidData(FILE, `${at}.answerId`, 'must be one of optionIds');
    if (item.kind === 'planet') {
      for (const id of item.optionIds) if (!planetIds.has(id)) invalidData(FILE, `${at}.optionIds`, `"${id}" is not a planet in planets.json`);
    }
    if (item.basedOn) checkBasedOn(item, at, planets);
  });
  for (const level of LEVEL_IDS) {
    const own = data.questions.filter((q) => q.level === level).length;
    if (own < MIN_PER_LEVEL) invalidData(FILE, 'questions', `needs at least ${MIN_PER_LEVEL} ${level} questions (found ${own})`);
  }
  return data.questions;
}

/**
 * Picks a round: questions of the chosen level first, and if there are too few, easier ones (a Hard round never goes
 * out short). Each question gets its answer plus random wrong options from its list, in random order.
 *
 * @param {{
 *   items: readonly QuizItem[], levelId: 'easy'|'medium'|'hard', count: number, optionCount: number,
 *   rng: import('../../../engine/utils/random.js').Rng
 * }} options
 * @returns {{ id: string, kind: 'planet'|'text', q: string, answerId: string, optionIds: string[], explain: string }[]}
 * @throws {GameError} 'NOT_ENOUGH_QUESTIONS', 'BAD_LEVEL'.
 */
export function buildQuiz({ items, levelId, count, optionCount, rng }) {
  const rank = LEVEL_IDS.indexOf(levelId);
  if (rank < 0) throw new GameError('BAD_LEVEL', `Unknown level "${levelId}"`, { levelId });
  const own = shuffle(rng, items.filter((q) => q.level === levelId));
  const easier = shuffle(rng, items.filter((q) => LEVEL_IDS.indexOf(q.level) < rank));
  const chosen = [...own, ...easier].slice(0, count);
  if (chosen.length < count) throw new GameError('NOT_ENOUGH_QUESTIONS', `Wanted ${count} ${levelId} questions, only ${chosen.length} exist`, { levelId, count });
  return chosen.map((item) => {
    const wrong = shuffle(rng, item.optionIds.filter((id) => id !== item.answerId)).slice(0, Math.max(1, optionCount - 1));
    return {
      id: item.id, kind: item.kind, q: item.q, answerId: item.answerId, explain: item.explain,
      optionIds: shuffle(rng, [item.answerId, ...wrong]),
    };
  });
}
