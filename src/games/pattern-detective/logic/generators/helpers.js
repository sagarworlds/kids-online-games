import { GameError } from '../../../../engine/utils/errors.js';
import { pick, randInt, shuffle } from '../../../../engine/utils/random.js';
import { MAX_NUMBER } from '../levels.js';
import { allDistinct, indexOfItem, same } from '../equality.js';

/**
 * Token colours come from the Okabe-Ito palette, which stays distinguishable for the common kinds of colour blindness.
 * Even so, the screen adds a pattern mark to each colour (see ui/TokenView.js), so colour is never the only clue.
 */
export const COLORS = Object.freeze({
  orange: '#E69F00', sky: '#56B4E9', green: '#009E73', yellow: '#F0E442', blue: '#0072B2', red: '#D55E00', purple: '#CC79A7',
});
export const COLOR_IDS = Object.freeze(Object.keys(COLORS));
export const SHAPES = Object.freeze(['circle', 'square', 'triangle', 'star']);
const OPTION_COUNT = 4;

/** @param {() => number} rng @param {number} count @returns {string[]} Distinct colour ids. */
export const pickColors = (rng, count) => shuffle(rng, COLOR_IDS).slice(0, count);
/** @param {() => number} rng @param {number} count @returns {string[]} Distinct shapes. */
export const pickShapes = (rng, count) => shuffle(rng, SHAPES).slice(0, count);

/** @param {import('../equality.js').Token} t @returns {string} e.g. "orange circle", "3 sky stars". */
export function describeToken(t) {
  if (t.shape === 'arrow') return `${t.color} arrow pointing ${['up', 'right', 'down', 'left'][(((t.rotation ?? 0) % 360) / 90 + 4) % 4]}`;
  const count = t.count ?? 1;
  return count > 1 ? `${count} ${t.color} ${t.shape}s` : `${t.color} ${t.shape}`;
}

/**
 * Where the missing item is: the end on Easy and Medium, and anywhere from `min` on Hard.
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {number} length Items in the sequence.
 * @param {() => number} rng
 * @param {number} [min] The earliest allowed position on Hard (so enough of the pattern stays visible).
 * @returns {number}
 */
export const missingIndexFor = (levelId, length, rng, min = 1) => (levelId === 'hard' ? randInt(rng, min, length - 1) : length - 1);

const clampNumber = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_NUMBER;

/**
 * Four number choices: the answer and three plausible wrong ones, shuffled.
 *
 * `groups` are the kinds of mistake the pattern invites (taking a whole step too many or too few; being one out; and so
 * on), each a list of numbers. One valid number is taken from every group first, so each kind of mistake is offered, and
 * any gap is then filled from what is left. "Valid" means a whole number from 0 to 200 that differs from the answer and
 * from the others already chosen. If fewer than three survive, numbers close to the answer fill the gap.
 *
 * @param {number} answer
 * @param {readonly (readonly number[])[]} groups
 * @param {() => number} rng
 * @returns {number[]} Four distinct numbers including `answer` exactly once.
 */
export function numberOptions(answer, groups, rng) {
  const wrong = [];
  const add = (n) => { if (clampNumber(n) && n !== answer && !wrong.includes(n)) wrong.push(n); };
  for (const group of groups) {
    const fresh = group.filter((n) => clampNumber(n) && n !== answer && !wrong.includes(n));
    if (fresh.length) add(pick(rng, fresh));
  }
  for (const n of shuffle(rng, groups.flat())) add(n);
  for (let offset = 1; wrong.length < OPTION_COUNT - 1 && offset <= MAX_NUMBER; offset++) {
    add(answer + offset);
    add(answer - offset);
  }
  return shuffle(rng, [answer, ...wrong.slice(0, OPTION_COUNT - 1)]);
}

/**
 * Four token choices: the answer and three wrong ones. Like `numberOptions`, one token is taken from each group of
 * natural mistakes first (a wrong item from the cycle, the right shape in the wrong colour, ...), then any gap is filled
 * from what is left and finally from `fallback()` (any other token), until there are three different ones.
 *
 * @param {import('../equality.js').Token} answer
 * @param {readonly (readonly import('../equality.js').Token[])[]} groups
 * @param {() => number} rng
 * @param {() => import('../equality.js').Token} fallback
 * @returns {import('../equality.js').Token[]}
 */
export function tokenOptions(answer, groups, rng, fallback) {
  const wrong = [];
  const add = (t) => { if (!same(t, answer) && indexOfItem(wrong, t) < 0) wrong.push(t); };
  for (const group of groups) {
    const fresh = group.filter((t) => !same(t, answer) && indexOfItem(wrong, t) < 0);
    if (fresh.length) add(pick(rng, fresh));
  }
  for (const t of shuffle(rng, groups.flat())) add(t);
  for (let tries = 0; wrong.length < OPTION_COUNT - 1; tries++) {
    if (tries > 200) throw new GameError('NO_OPTIONS', 'Could not make four different choices', { answer });
    add(fallback());
  }
  const options = shuffle(rng, [answer, ...wrong.slice(0, OPTION_COUNT - 1)]);
  if (!allDistinct(options)) throw new GameError('NO_OPTIONS', 'Options were not distinct', { answer });
  return options;
}

/** A random colour that is not `not`. */
export const otherColor = (rng, not) => pick(rng, COLOR_IDS.filter((c) => c !== not));
