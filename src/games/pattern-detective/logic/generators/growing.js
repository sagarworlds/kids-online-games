import { pick, randInt } from '../../../../engine/utils/random.js';
import { SHAPES, pickColors, tokenOptions } from './helpers.js';

const MAX_GROUP = 9;

/**
 * A growing pattern: groups of the same shape with one more (or two more) each time, like one star, two stars, three
 * stars. The missing group is the last on Easy and Medium and can be any group after the first on Hard.
 *
 * @type {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('../puzzle.js').Puzzle }}
 */
export const growing = {
  id: 'growing',
  levels: ['easy', 'medium', 'hard'],
  generate(rng, levelId) {
    const step = levelId === 'easy' ? 1 : pick(rng, [1, 2]);
    const length = 5;
    const start = randInt(rng, 1, step === 2 ? 1 : 3);
    const shape = pick(rng, SHAPES);
    const color = pickColors(rng, 1)[0];
    const group = (n) => ({ shape, color, count: n });
    const items = Array.from({ length }, (_, i) => group(start + step * i));
    const missingIndex = levelId === 'hard' ? randInt(rng, 1, length - 1) : length - 1;
    const answer = items[missingIndex];

    const n = answer.count;
    // Plausible slips: the previous group again, one too many, one too few, or the step doubled.
    const ok = (c) => c >= 1 && c <= MAX_GROUP + 1 && c !== n;
    const groups = [[n - step, n + step], [n - 1, n + 1], [n + 2, n - 2]].map((g) => g.filter(ok).map(group));
    const options = tokenOptions(answer, groups, rng, () => group(randInt(rng, 1, MAX_GROUP)));
    const noun = `${shape}${step > 1 ? 's' : ''}`;
    return {
      type: 'growing', items, missingIndex, answer, options,
      ruleText: `Each group has ${step === 1 ? 'one' : step} more ${step === 1 ? shape : noun} than the one before.`,
      hint: {
        kind: 'count', text: 'Count the shapes in each group. How many more does each group have?',
        labels: items.map((item, i) => (i === missingIndex ? null : String(item.count))),
      },
    };
  },
};
