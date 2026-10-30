import { pick, randInt } from '../../../../engine/utils/random.js';
import { SHAPES, pickColors, pickShapes, describeToken, missingIndexFor, tokenOptions, otherColor } from './helpers.js';

/** The repeating units. Each letter is one kind of item: AB is "one, two, one, two", ABB is "one, two, two, one, two, two". */
const UNITS = { easy: ['AB', 'AAB'], medium: ['AB', 'ABC', 'AAB', 'ABB'], hard: ['ABC', 'AAB', 'ABB'] };

/**
 * A repeating pattern of colours or shapes (AB, ABC, AAB, ABB), like red, blue, red, blue, ...
 *
 * Either the colour or the shape changes (so the child has to look at the right thing), never both. On Hard the missing
 * item can be anywhere after the first full repeat, so the unit is always visible once.
 *
 * @type {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('../puzzle.js').Puzzle }}
 */
export const repeating = {
  id: 'repeating',
  levels: ['easy', 'medium', 'hard'],
  generate(rng, levelId) {
    const unit = pick(rng, UNITS[levelId]);
    const letters = [...new Set(unit)];
    const byColor = rng() < 0.5;
    const fixedShape = pick(rng, SHAPES);
    const fixedColor = pickColors(rng, 1)[0];
    const varying = byColor ? pickColors(rng, letters.length) : pickShapes(rng, letters.length);
    const kinds = Object.fromEntries(letters.map((letter, i) => [letter, byColor
      ? { shape: fixedShape, color: varying[i] }
      : { shape: varying[i], color: fixedColor }]));

    const length = randInt(rng, 5, 6);
    const items = Array.from({ length }, (_, i) => ({ ...kinds[unit[i % unit.length]] }));
    const missingIndex = missingIndexFor(levelId, length, rng, unit.length);
    const answer = items[missingIndex];

    // Mistakes a child makes: the wrong item from the cycle, the right shape in the wrong colour, the right colour in the wrong shape.
    const groups = [
      letters.map((letter) => kinds[letter]),
      [{ shape: answer.shape, color: otherColor(rng, answer.color) }],
      [{ shape: pick(rng, SHAPES.filter((s) => s !== answer.shape)), color: answer.color }],
    ];
    const options = tokenOptions(answer, groups, rng, () => ({ shape: pick(rng, SHAPES), color: pickColors(rng, 1)[0] }));
    return {
      type: 'repeating', items, missingIndex, answer, options,
      ruleText: `The pattern repeats: ${unit.split('').map((l) => describeToken(kinds[l])).join(', then ')}.`,
      hint: { kind: 'unit', text: 'Look for the part that repeats. It is circled.', highlight: Array.from({ length: unit.length }, (_, i) => i) },
    };
  },
};
