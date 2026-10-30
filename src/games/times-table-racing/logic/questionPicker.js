import { GameError } from '../../../engine/utils/errors.js';
import { RETRY_GAP } from './levels.js';
import { weightOf } from './weights.js';

/**
 * Chooses the next fact to ask.
 *
 * - Random, but weighted: a fact the child has missed before has a higher weight, so it is asked more often.
 * - Never the same fact twice in a row (unless there is only one fact).
 * - `retry(fact)` brings a just-missed fact back after `gap` other questions ("repeats the question later").
 *
 * @param {{
 *   facts: readonly import('./facts.js').Fact[], weights?: import('./weights.js').FactWeights,
 *   rng: () => number, gap?: number
 * }} options
 * @returns {{ next: () => import('./facts.js').Fact, retry: (fact: import('./facts.js').Fact) => void }}
 * @throws {GameError} 'NO_FACTS' if the list is empty.
 */
export function createPicker({ facts, weights = {}, rng, gap = RETRY_GAP }) {
  if (facts.length === 0) throw new GameError('NO_FACTS', 'The question picker needs at least one fact');
  let lastKey = null;
  /** @type {{ fact: import('./facts.js').Fact, wait: number }[]} */
  const retries = [];

  const weighted = (candidates) => {
    const total = candidates.reduce((sum, f) => sum + weightOf(weights, f.key), 0);
    let ticket = rng() * total;
    for (const fact of candidates) {
      ticket -= weightOf(weights, fact.key);
      if (ticket < 0) return fact;
    }
    return candidates[candidates.length - 1];
  };

  return {
    next() {
      for (const entry of retries) entry.wait -= 1;
      const due = retries.findIndex((entry) => entry.wait <= 0 && entry.fact.key !== lastKey);
      let fact;
      if (due >= 0) {
        fact = retries.splice(due, 1)[0].fact;
      } else {
        const others = facts.filter((f) => f.key !== lastKey);
        fact = weighted(others.length ? others : facts);
      }
      lastKey = fact.key;
      return fact;
    },
    retry(fact) {
      if (!retries.some((entry) => entry.fact.key === fact.key)) retries.push({ fact, wait: gap + 1 });
    },
  };
}
