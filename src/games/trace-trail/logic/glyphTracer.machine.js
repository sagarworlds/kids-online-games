import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * The pencil on a whole glyph: its strokes one after another (see {@link import('./trace.js').GlyphTracer}). The life of a
 * single stroke is `stroke.machine.js`; the life of the screen around the glyph is `glyphFlow.machine.js`.
 *
 * - `ready`: the pencil is up and a stroke is waiting to be started.
 * - `down`: the pencil went down at the start of the current stroke and is following it.
 * - `done`: every stroke is finished.
 *
 * `STROKE_DONE` and `GLYPH_DONE` are both "the pencil reached the end of a stroke"; which one it is depends on whether
 * that was the last stroke, which the glyph knows and the machine does not.
 */
export const GLYPH_TRACER_MACHINE = defineMachine({
  id: 'trace-trail/glyph-tracer',
  initial: 'ready',
  states: {
    ready: { on: { PEN_DOWN: 'down' } },
    down: { on: { PEN_UP: 'ready', STROKE_DONE: 'ready', GLYPH_DONE: 'done' } },
    done: { final: true },
  },
});
