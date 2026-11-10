import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * One stroke of a letter (see {@link import('./trace.js').StrokeTracker}).
 *
 * - `idle`: the pencil is not on the stroke.
 * - `tracing`: the pencil went down at the start and is following the path. Going down at the start again begins a fresh attempt.
 * - `done`: the end was reached. The stroke is finished for good.
 */
export const STROKE_MACHINE = defineMachine({
  id: 'trace-trail/stroke',
  initial: 'idle',
  states: {
    idle: { on: { START: 'tracing' } },
    tracing: { on: { START: 'tracing', FINISH: 'done', GIVE_UP: 'idle' } },
    done: { final: true },
  },
});
