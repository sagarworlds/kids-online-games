import { pick, randInt } from '../../../../engine/utils/random.js';
import { MAX_NUMBER } from '../levels.js';
import { numberOptions, missingIndexFor } from './helpers.js';

/** Steps allowed at each level: small friendly ones on Easy, wider on Hard. */
const STEPS = { easy: [2, 3, 4, 5, 10], medium: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12], hard: [3, 4, 6, 7, 8, 9, 11, 12, 15, 20, 25] };

/**
 * Builds the number-sequence generators that go up or down by the same amount each time. Add and subtract are the same
 * idea with the sign flipped, so one maker serves both (and a new kind of step would be a new call, not new code).
 *
 * @param {{ id: string, levels: readonly string[], direction: 1|-1, rule: (step: number) => string, between: (step: number) => string, hint: string }} spec
 */
function makeArithmetic({ id, levels, direction, rule, between, hint }) {
  return {
    id,
    levels,
    generate(rng, levelId) {
      const step = pick(rng, STEPS[levelId]);
      const length = randInt(rng, 5, 6);
      const span = step * (length - 1);
      // Room for the whole sequence inside 0 to 200: going up it must not pass 200, going down it must not drop below 0.
      const first = direction === 1 ? randInt(rng, 0, Math.min(MAX_NUMBER - span, 30)) : span + randInt(rng, 0, Math.min(MAX_NUMBER - span, 30));
      const items = Array.from({ length }, (_, i) => first + direction * step * i);
      const missingIndex = missingIndexFor(levelId, length, rng, 1);
      const answer = items[missingIndex];
      // Slips: taking the wrong number of steps, going the wrong way, or being one out.
      const groups = [[answer + step, answer - step], [answer + 1, answer - 1], [answer + 2 * step, answer - 2 * step, answer + 2, answer - 2]];
      return {
        type: id, items, missingIndex, answer, options: numberOptions(answer, groups, rng),
        ruleText: rule(step),
        hint: {
          kind: 'differences', text: hint,
          between: items.slice(1).map((_, i) => (i === missingIndex - 1 || i === missingIndex ? null : between(step))),
        },
      };
    },
  };
}

export const addConstant = makeArithmetic({
  id: 'add', levels: ['easy', 'medium', 'hard'], direction: 1,
  rule: (step) => `Add ${step} each time (+${step}).`, between: (step) => `+${step}`,
  hint: 'Look at how much each number goes up by.',
});

export const subtractConstant = makeArithmetic({
  id: 'subtract', levels: ['medium', 'hard'], direction: -1,
  rule: (step) => `Take away ${step} each time (−${step}).`, between: (step) => `−${step}`,
  hint: 'Look at how much each number goes down by.',
});
