import { pick, randInt } from '../../../../engine/utils/random.js';
import { pickColors, tokenOptions, missingIndexFor } from './helpers.js';

/** The turn each step makes, in degrees clockwise, with how to say it. */
const TURNS = [
  { degrees: 90, say: 'a quarter turn clockwise' },
  { degrees: 270, say: 'a quarter turn anticlockwise' },
  { degrees: 180, say: 'a half turn' },
];
const wrap = (d) => ((d % 360) + 360) % 360;

/**
 * An arrow that turns by the same amount each time: 0°, 90°, 180°, 270° (Hard). The four choices are the arrow in each of
 * the four directions, so the child has to work out which way it should point; exactly one is right.
 *
 * @type {{ id: string, levels: readonly string[], generate: (rng: () => number, levelId: 'easy'|'medium'|'hard') => import('../puzzle.js').Puzzle }}
 */
export const rotation = {
  id: 'rotation',
  levels: ['hard'],
  generate(rng, levelId) {
    const { degrees, say } = pick(rng, TURNS);
    const color = pickColors(rng, 1)[0];
    const length = randInt(rng, 5, 6);
    const start = pick(rng, [0, 90, 180, 270]);
    const items = Array.from({ length }, (_, i) => ({ shape: 'arrow', color, rotation: wrap(start + degrees * i) }));
    const missingIndex = missingIndexFor(levelId, length, rng, 2);
    const answer = items[missingIndex];
    const options = tokenOptions(answer, [[0, 90, 180, 270].map((r) => ({ shape: 'arrow', color, rotation: r }))], rng, () => ({ shape: 'arrow', color, rotation: 0 }));
    return {
      type: 'rotation', items, missingIndex, answer, options,
      ruleText: `The arrow turns ${say} each time.`,
      hint: {
        kind: 'rotation', text: 'Look at which way the arrow points each time. How far does it turn?',
        labels: items.map((item, i) => (i === missingIndex ? null : `${item.rotation}°`)),
      },
    };
  },
};
