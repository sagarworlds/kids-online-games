import { pick, randInt } from '../../../../engine/utils/random.js';
import { MAX_NUMBER } from '../levels.js';
import { numberOptions } from './helpers.js';

/**
 * The gap is in the middle, not the end: 5, 10, ?, 20, 25 (Hard). Five numbers, always adding the same amount, with the
 * hidden one in the 2nd, 3rd or 4th place, so there are numbers on both sides to work from.
 *
 * @type {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('../puzzle.js').Puzzle }}
 */
export const missingMiddle = {
  id: 'missing-middle',
  levels: ['hard'],
  generate(rng) {
    const step = pick(rng, [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25]);
    const length = 5;
    const first = randInt(rng, 0, Math.min(MAX_NUMBER - step * (length - 1), 40));
    const items = Array.from({ length }, (_, i) => first + step * i);
    const missingIndex = randInt(rng, 1, length - 2);
    const answer = items[missingIndex];
    const groups = [[answer + step, answer - step], [answer + 1, answer - 1], [items[missingIndex + 1] + step, items[missingIndex - 1] - step, answer + 2, answer - 2]];
    return {
      type: 'missing-middle', items, missingIndex, answer, options: numberOptions(answer, groups, rng),
      ruleText: `Add ${step} each time (+${step}). The missing number fits between its neighbours.`,
      hint: {
        kind: 'gap', text: 'Work out how much the numbers you can see go up by, then fill the gap.',
        between: items.slice(1).map((_, i) => (i === missingIndex - 1 || i === missingIndex ? null : `+${step}`)),
      },
    };
  },
};
