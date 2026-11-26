import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * The life of a run of rounds (see {@link import('./session.js').RoundSession}). How many tries the current round has had
 * is a count, not a phase, so it stays a number in the session.
 *
 * - `asking`: a round is open. Answers are accepted; a wrong one that does not yet show the answer leaves it open.
 * - `revealed`: the round is finished (right, or out of tries) and its answer is on show. Answers are refused until the
 *   run moves on.
 * - `over`: the last round has been moved past. Nothing more happens.
 *
 * `NEXT_ROUND` and `FINISH` are both "move on"; which one it is depends on whether that was the last round, which the
 * session knows and the machine does not.
 */
export const ROUND_SESSION_MACHINE = defineMachine({
  id: 'matra-mixer/round-session',
  initial: 'asking',
  states: {
    asking: { on: { REVEAL: 'revealed' } },
    revealed: { on: { NEXT_ROUND: 'asking', FINISH: 'over' } },
    over: { final: true },
  },
});
