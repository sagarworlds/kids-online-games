import { defineMachine } from '../utils/stateMachine.js';

/**
 * The one pointer gesture that {@link import('./InputService.js').InputService} follows at a time.
 *
 * - `idle`: no pointer is down.
 * - `pressed`: a pointer is down and has not moved far enough to be a drag. Lifting it now is a `tap`.
 * - `dragging`: it moved past the drag threshold. Lifting it is a `dragend`; cancelling it is a `dragend` flagged `cancelled`.
 *
 * A pointer going down while a gesture is already running **replaces** it, from `pressed` or from `dragging`: the earlier
 * pointer is forgotten, and its lift is ignored because it no longer matches. That is how the service has always behaved.
 * From `dragging` it means the earlier drag is dropped without a `dragend` (nothing in the app listens for drags yet).
 */
export const POINTER_GESTURE_MACHINE = defineMachine({
  id: 'engine/pointer-gesture',
  initial: 'idle',
  states: {
    idle: { on: { POINTER_DOWN: 'pressed' } },
    pressed: { on: { POINTER_DOWN: 'pressed', DRAG_START: 'dragging', POINTER_UP: 'idle', CANCEL: 'idle' } },
    dragging: { on: { POINTER_DOWN: 'pressed', POINTER_UP: 'idle', CANCEL: 'idle' } },
  },
});
