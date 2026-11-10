import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the Simon Says play screen is doing, as opposed to what the rules say (that is `simonGame.machine.js`).
 *
 * - `listening`: the screen is showing a sequence (or waiting a moment before it). Taps are ignored.
 * - `answering`: the child may answer; the answer clock runs.
 * - `between`: a round was won; a short pause before the next, longer sequence.
 * - `ending`: the game is over; a short pause before the results.
 * - `suspendedListening` / `suspendedBetween`: the tab was hidden during `listening` / `between`. Everything that was
 *   running is cancelled, and showing the tab again picks up where it left off. Without these two states a hidden tab
 *   during a pause froze the game for good.
 * - `left`: the child went away; nothing else may start.
 *
 * `LEAVE` is allowed everywhere because the scene can be closed at any moment.
 */
export const SIMON_PLAY_FLOW = defineMachine({
  id: 'simon-says/play-flow',
  initial: 'listening',
  states: {
    listening: { on: { PLAYED: 'answering', HIDE: 'suspendedListening', LEAVE: 'left' } },
    answering: { on: { REPLAY: 'listening', RETRY: 'listening', ROUND_DONE: 'between', GAME_OVER: 'ending', LEAVE: 'left' } },
    between: { on: { NEXT: 'listening', HIDE: 'suspendedBetween', LEAVE: 'left' } },
    ending: { on: { LEAVE: 'left' } },
    suspendedListening: { on: { SHOW: 'listening', LEAVE: 'left' } },
    suspendedBetween: { on: { SHOW: 'between', LEAVE: 'left' } },
    left: { final: true },
  },
});
