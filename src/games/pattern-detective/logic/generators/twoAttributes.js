import { pick, randInt } from '../../../../engine/utils/random.js';
import { pickColors, pickShapes, tokenOptions } from './helpers.js';

/**
 * Two things change at once, the shape and the colour, each on its own cycle: red triangle, blue square, red triangle,
 * blue square. On Medium both cycle every 2; on Hard the shape cycles every 2 and the colour every 3 (or the other way
 * round), so the child has to follow each separately. The missing item is the last on Medium and any of the last three
 * on Hard (so each cycle is visible once before it).
 *
 * @type {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('../puzzle.js').Puzzle }}
 */
export const twoAttributes = {
  id: 'two-attributes',
  levels: ['medium', 'hard'],
  generate(rng, levelId) {
    const [shapePeriod, colorPeriod] = levelId === 'hard' ? pick(rng, [[2, 3], [3, 2]]) : [2, 2];
    const shapes = pickShapes(rng, shapePeriod);
    const colors = pickColors(rng, colorPeriod);
    const length = 6;
    const items = Array.from({ length }, (_, i) => ({ shape: shapes[i % shapePeriod], color: colors[i % colorPeriod] }));
    const missingIndex = levelId === 'hard' ? randInt(rng, 3, length - 1) : length - 1;
    const answer = items[missingIndex];

    // Slips: right shape with the wrong colour, wrong shape with the right colour, or a neighbour in the cycle.
    const wrongColor = pick(rng, colors.filter((c) => c !== answer.color).concat(pickColors(rng, 2).filter((c) => c !== answer.color)));
    const wrongShape = pick(rng, shapes.filter((s) => s !== answer.shape).concat(pickShapes(rng, 2).filter((s) => s !== answer.shape)));
    const groups = [
      [{ shape: answer.shape, color: wrongColor }], [{ shape: wrongShape, color: answer.color }],
      [items[missingIndex - 1], items[missingIndex - 2], { shape: wrongShape, color: wrongColor }],
    ];
    const options = tokenOptions(answer, groups, rng, () => ({ shape: pickShapes(rng, 1)[0], color: pickColors(rng, 1)[0] }));
    return {
      type: 'two-attributes', items, missingIndex, answer, options,
      ruleText: `The shape goes ${shapes.join(', ')} and the colour goes ${colors.join(', ')}, each over and over.`,
      hint: { kind: 'attributes', text: 'Two things are changing. Look at the shapes on their own, then at the colours on their own.', highlight: [] },
    };
  },
};
