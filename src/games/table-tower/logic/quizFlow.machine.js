import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the Table Tower quiz screen is doing (the questions and scoring are in `session.js`).
 *
 * - `asking`: a question waits for an answer; in a Challenge the clock runs.
 * - `feedback`: the answer was marked and is on show; the clock is stopped.
 * - `done`: the results screen has been asked for, either after the last question (`FINISH`) or because the time ran out
 *   while a question was waiting (`TIME_UP`).
 */
export const QUIZ_FLOW = defineMachine({
  id: 'table-tower/quiz-flow',
  initial: 'asking',
  states: {
    asking: { on: { ANSWER: 'feedback', TIME_UP: 'done' } },
    feedback: { on: { NEXT: 'asking', FINISH: 'done' } },
    done: { final: true },
  },
});
