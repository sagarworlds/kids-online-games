import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * The life of a run of questions (see {@link import('./session.js').QuizSession}). The questions, the queue of repeats and
 * the seconds left are data, not phases, so they stay in the session. This is the part that says what is allowed.
 *
 * - `asking`: a question waits for an answer.
 * - `answered`: it was answered and the result is on show; the next answer is refused until `advance()`.
 * - `finished`: the last question has been moved past.
 * - `timedOut`: the clock ran out. It can happen in `asking`, and also in `answered` because the session's clock does not
 *   look at what is on show (the screen only ticks it while a question is waiting, but the session itself would accept it).
 *
 * `finished` and `timedOut` both carry the tag `over`, and the session reports `timedOut` in its summary from which of the
 * two it is in. `NEXT` and `FINISH` are both "move on"; which one depends on whether that was the last question in the queue,
 * which the session knows and the machine does not.
 */
export const QUIZ_SESSION_MACHINE = defineMachine({
  id: 'table-tower/quiz-session',
  initial: 'asking',
  states: {
    asking: { on: { ANSWER: 'answered', TIME_UP: 'timedOut' } },
    answered: { on: { NEXT: 'asking', FINISH: 'finished', TIME_UP: 'timedOut' } },
    finished: { final: true, tags: ['over'] },
    timedOut: { final: true, tags: ['over'] },
  },
});
