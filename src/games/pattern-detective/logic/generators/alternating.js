import { pick, randInt } from '../../../../engine/utils/random.js';
import { MAX_NUMBER } from '../levels.js';
import { numberOptions } from './helpers.js';

/**
 * A pattern whose jump alternates: +2, +3, +2, +3, ... (Hard). Six numbers, so each jump size shows up at least twice
 * when nothing is hidden; the missing number can be anywhere after the first.
 *
 * @type {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('../puzzle.js').Puzzle }}
 */
export const alternating = {
  id: 'alternating',
  levels: ['hard'],
  generate(rng) {
    const small = randInt(rng, 1, 8);
    const big = small + randInt(rng, 1, 4);
    const [a, b] = pick(rng, [[small, big], [big, small]]);
    const length = 6;
    const first = randInt(rng, 0, Math.min(MAX_NUMBER - (a + b) * 3, 30));
    const jumps = Array.from({ length: length - 1 }, (_, i) => (i % 2 === 0 ? a : b));
    const items = [first];
    for (const j of jumps) items.push(items[items.length - 1] + j);
    const missingIndex = randInt(rng, 1, length - 1);
    const answer = items[missingIndex];
    const wrongJump = jumps[missingIndex - 1] === a ? b : a; // using the other jump: the classic slip
    const groups = [[items[missingIndex - 1] + wrongJump], [answer + 1, answer - 1], [items[missingIndex - 1] + a + b, answer + a, answer - b]];
    return {
      type: 'alternating', items, missingIndex, answer, options: numberOptions(answer, groups, rng),
      ruleText: `The jumps take turns: +${a}, then +${b}, then +${a}, then +${b}.`,
      hint: {
        kind: 'alternating', text: 'The jumps are not all the same. Compare the jump after each number.',
        between: jumps.map((j, i) => (i === missingIndex - 1 || i === missingIndex ? null : `+${j}`)),
      },
    };
  },
};
