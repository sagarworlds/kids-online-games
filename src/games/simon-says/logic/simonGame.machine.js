import { defineMachine } from '../../../engine/utils/stateMachine.js';

/** Every phase can be left by a fresh `start()` or by `addStep()`, which both begin a new sequence. */
const NEW_SEQUENCE = { START: 'playing', ADD_STEP: 'playing' };

/**
 * The phases of one Simon Says game (see {@link import('./simonGame.js').SimonGame}).
 *
 * - `idle`: nothing is being played; the scene calls `addStep()` for the next round.
 * - `playing`: the scene is showing the sequence. Taps are ignored.
 * - `input`: the child may answer.
 * - `retry`: the child got it wrong once; the same sequence is shown again.
 * - `over`: two wrong answers on one sequence. Nothing but a new `start()` follows.
 */
export const SIMON_GAME_MACHINE = defineMachine({
  id: 'simon-says/game',
  initial: 'idle',
  states: {
    idle: { on: { ...NEW_SEQUENCE } },
    playing: { on: { ...NEW_SEQUENCE, BEGIN_INPUT: 'input' } },
    input: { on: { ...NEW_SEQUENCE, ROUND_COMPLETE: 'idle', RETRY: 'retry', GAME_OVER: 'over' } },
    retry: { on: { ...NEW_SEQUENCE, BEGIN_INPUT: 'input' } },
    over: { on: { ...NEW_SEQUENCE } },
  },
});
