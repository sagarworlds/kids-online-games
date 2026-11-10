import { defineMachine } from '../../../engine/utils/stateMachine.js';

/**
 * What the Trace Trail screen is doing for one glyph (a letter, number or word). The rules of following a stroke are in
 * `trace.js`; this is the life of the screen around them.
 *
 * - `starting`: the glyph is on the page but the tracing rules are not set up yet (they need the page's size on this
 *   screen, which is known one frame later). Nothing can be traced and Watch has nothing to show yet.
 * - `demoing`: the pencil shows how to write it. The board is locked.
 * - `tracing`: the child's turn; the pencil is accepted.
 * - `done`: the glyph is finished (traced, or skipped). Next moves on.
 * - `leaving`: the last glyph's Next was pressed and the results were asked for; a second press does nothing.
 *
 * `WATCH` is the Watch button, which only works once the tracing rules exist, so it is not allowed in `starting`.
 * `Skip` is `FINISH`, and it works at any time before the glyph is finished.
 */
export const GLYPH_FLOW = defineMachine({
  id: 'trace-trail/glyph-flow',
  initial: 'starting',
  states: {
    starting: { on: { SHOW_DEMO: 'demoing', BEGIN_TURN: 'tracing', FINISH: 'done' } },
    demoing: { on: { WATCH: 'demoing', DEMO_ENDED: 'tracing', FINISH: 'done' } },
    tracing: { on: { WATCH: 'demoing', FINISH: 'done' } },
    done: { on: { NEXT: 'starting', LEAVE: 'leaving' } },
    leaving: { final: true },
  },
});
