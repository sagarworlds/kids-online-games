import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the Times Table Racing screen is doing during one race (the rules are in `race.js`).
 *
 * - `countdown`: "Ready, set, go". The clock has not started and answers are not accepted.
 * - `racing`: the clock runs; the child answers.
 * - `finishing`: the finish line was crossed; a short celebration.
 * - `done`: the results screen has been asked for.
 *
 * Tag `pausable`: the Paused overlay may be shown (it can happen in any such state and then changes nothing else).
 */
export const RACE_FLOW = defineMachine({
  id: 'times-table-racing/race-flow',
  initial: 'countdown',
  states: {
    countdown: { on: { GO: 'racing' }, tags: ['pausable'] },
    racing: { on: { FINISH: 'finishing' }, tags: ['pausable'] },
    finishing: { on: { END: 'done' } },
    done: { final: true },
  },
});
