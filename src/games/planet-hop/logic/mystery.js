import { GameError } from '../../../engine/utils/errors.js';
import { shuffle } from '../../../engine/utils/random.js';
import { feltWeight } from './weight.js';

/**
 * Two bodies are told apart only if one pulls at least this much harder than the other. Mercury and Mars have the same
 * gravity, so "which planet would make you 7.6 kg?" could not be answered if both were offered; Venus and Uranus (0.91
 * and 0.90) are one hundredth apart and Earth and Saturn only 7% apart, which a child cannot read off a scale.
 */
export const MIN_SEPARATION = 1.08;

/** @param {{ gravity: number }} a @param {{ gravity: number }} b @returns {boolean} */
export const distinguishable = (a, b) => Math.max(a.gravity, b.gravity) / Math.min(a.gravity, b.gravity) >= MIN_SEPARATION;

/**
 * @typedef {{ answerId: string, optionIds: string[], felt: number }} MysteryQuestion
 * "You would weigh `felt` kg on a mystery planet. Which one is it?"
 */

/**
 * Builds the weigh-in's closing questions. Each has exactly one possible answer: every option pulls clearly differently
 * from every other (see MIN_SEPARATION), so the felt weights can be told apart.
 *
 * @param {{
 *   bodies: readonly { id: string, gravity: number }[], kg: number, count: number, optionCount: number,
 *   rng: import('../../../engine/utils/random.js').Rng
 * }} options `kg` is the child's weight, never stored.
 * @returns {MysteryQuestion[]} `count` questions with different answers.
 * @throws {GameError} 'BAD_MYSTERY' if there are not enough bodies, 'NOT_ENOUGH_OPTIONS' if a question cannot get `optionCount` distinct options.
 */
export function buildMystery({ bodies, kg, count, optionCount, rng }) {
  if (count > bodies.length) throw new GameError('BAD_MYSTERY', `Cannot ask ${count} questions about ${bodies.length} places`, { count });
  const answers = shuffle(rng, bodies).slice(0, count);
  return answers.map((answer) => {
    const chosen = [answer];
    for (const candidate of shuffle(rng, bodies)) {
      if (chosen.length === optionCount) break;
      if (chosen.every((c) => distinguishable(c, candidate))) chosen.push(candidate);
    }
    if (chosen.length < optionCount) {
      throw new GameError('NOT_ENOUGH_OPTIONS', `Only ${chosen.length} clearly different places for ${answer.id}, wanted ${optionCount}`, { answerId: answer.id, optionCount });
    }
    return { answerId: answer.id, optionIds: shuffle(rng, chosen.map((c) => c.id)), felt: feltWeight(kg, answer.gravity) };
  });
}

/**
 * The other places that pull exactly as hard as this one (Mars for Mercury and the other way round), so the answer
 * screen can say "Mars pulls just the same" and the child knows why it was never offered together with Mercury.
 * @template {{ id: string, gravity: number }} T
 * @param {readonly T[]} bodies
 * @param {T} body
 * @returns {T[]}
 */
export const sameGravity = (bodies, body) => bodies.filter((b) => b.id !== body.id && b.gravity === body.gravity);
