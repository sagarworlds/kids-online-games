import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * The memory-match turn (see {@link import('./matchState.js').MatchGame}).
 *
 * - `idle`: no card is turned over.
 * - `oneUp`: one card is up, waiting for the second.
 * - `twoUp`: two cards that do not match are showing; every flip is ignored until `settle()` turns them back.
 */
export const MATCH_TURN_MACHINE = defineMachine({
  id: 'hindi-english-match/turn',
  initial: 'idle',
  states: {
    idle: { on: { FLIP_FIRST: 'oneUp' } },
    oneUp: { on: { MATCH: 'idle', MISMATCH: 'twoUp' } },
    twoUp: { on: { SETTLE: 'idle' } },
  },
});
