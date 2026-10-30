import { GameError } from '../../../../engine/utils/errors.js';
import { pick } from '../../../../engine/utils/random.js';
import { MAX_NUMBER } from '../levels.js';
import { numberOptions, missingIndexFor } from './helpers.js';

/** Each ratio with the longest sequence that stays under 200 and the first numbers that work. */
const RATIOS = [
  { ratio: 2, length: 6, firsts: [1, 2, 3, 5] },
  { ratio: 2, length: 5, firsts: [1, 2, 3, 4, 5, 6] },
  { ratio: 3, length: 5, firsts: [1, 2] },
];

/**
 * A doubling (or tripling) pattern: 2, 4, 8, 16, 32. Medium and Hard.
 * The usual mistake is to keep adding the last jump (2, 4, 8, 16 then 24), so that is always one of the wrong choices.
 *
 * @type {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('../puzzle.js').Puzzle }}
 */
export const multiply = {
  id: 'multiply',
  levels: ['medium', 'hard'],
  generate(rng, levelId) {
    const { ratio, length, firsts } = pick(rng, levelId === 'hard' ? RATIOS : RATIOS.slice(1));
    const first = pick(rng, firsts);
    const items = Array.from({ length }, (_, i) => first * ratio ** i);
    // The ratio table is written to keep every number inside 0 to 200; this catches an edit that breaks that.
    if (items[length - 1] > MAX_NUMBER) throw new GameError('BAD_GENERATOR', `multiply made ${items.join(', ')}, above ${MAX_NUMBER}`, { items });
    const missingIndex = missingIndexFor(levelId, length, rng, 2);
    const answer = items[missingIndex];
    const before = items[missingIndex - 1];
    const lastJump = before - (items[missingIndex - 2] ?? 0);
    const groups = [[before + lastJump], [answer + ratio, answer - ratio, answer * ratio, answer + before], [answer + 1, answer - 1]];
    return {
      type: 'multiply', items, missingIndex, answer, options: numberOptions(answer, groups, rng),
      ruleText: ratio === 2 ? 'Double the number each time (×2).' : 'Multiply by 3 each time (×3).',
      hint: {
        kind: 'ratio', text: `Look at how many times bigger each number is than the one before.`,
        between: items.slice(1).map((_, i) => (i === missingIndex - 1 || i === missingIndex ? null : `×${ratio}`)),
      },
    };
  },
};
