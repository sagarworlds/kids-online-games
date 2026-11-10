import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the Word Builder Bubbles play screen is doing for one word.
 *
 * - `playing`: bubbles drift; the child pops them in spelling order.
 * - `solved`: the word is spelled; the celebration shows and the Next button waits.
 * - `done`: Next was pressed and the following screen has been asked for.
 *
 * Tags: `pausable` (the Paused overlay may be shown), `inputOpen` (popping and hints are accepted) and `solved`
 * (the word is finished, whether or not the child has moved on).
 */
export const BUBBLES_PLAY_FLOW = defineMachine({
  id: 'word-builder-bubbles/play-flow',
  initial: 'playing',
  states: {
    playing: { on: { SOLVE: 'solved' }, tags: ['pausable', 'inputOpen'] },
    solved: { on: { LEAVE: 'done' }, tags: ['solved'] },
    done: { final: true, tags: ['solved'] },
  },
});
