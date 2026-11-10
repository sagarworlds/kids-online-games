import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the Number Ninja play screen is doing (the rules of a round are in `round.js`).
 *
 * - `ready`: the "Ready… Go!" moment before the first star falls.
 * - `playing`: stars fall; the child types answers.
 * - `finishing`: the round is over (all stars resolved, or no shields left); a short pause so the child sees what
 *   happened before the results.
 * - `done`: the results screen has been asked for.
 *
 * Tags: `pausable` (the Paused overlay may be shown) and `inputOpen` (typing and the number pad are accepted).
 * Being paused is not a state of its own: it can happen in any `pausable` state and then changes nothing else.
 */
export const NINJA_PLAY_FLOW = defineMachine({
  id: 'number-ninja/play-flow',
  initial: 'ready',
  states: {
    ready: { on: { GO: 'playing', FINISH: 'finishing' }, tags: ['pausable', 'inputOpen'] },
    playing: { on: { FINISH: 'finishing' }, tags: ['pausable', 'inputOpen'] },
    finishing: { on: { END: 'done' } },
    done: { final: true },
  },
});
