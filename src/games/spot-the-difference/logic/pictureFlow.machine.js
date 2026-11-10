import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the Spot the Difference screen is doing for one picture (the rules of tapping, hints and stars are in `round.js`).
 *
 * - `playing`: the pair is on screen and the child looks for differences. Taps, the keyboard pointer and hints work, and
 *   the clock runs.
 * - `done`: every difference is found. The pictures are locked and the Next button waits.
 * - `leaving`: the last picture's Next was pressed and the results were asked for; a second press does nothing.
 *
 * Holding the screen (a hidden tab, the grown-ups dialog) is not a state: it can happen while `playing` and changes
 * nothing else, so the scene keeps a set of the reasons beside the machine, as `table-tower/quiz-flow` does.
 */
export const PICTURE_FLOW = defineMachine({
  id: 'spot-the-difference/picture-flow',
  initial: 'playing',
  states: {
    playing: { on: { FOUND_ALL: 'done' } },
    done: { on: { NEXT_PICTURE: 'playing', LEAVE: 'leaving' } },
    leaving: { final: true },
  },
});
