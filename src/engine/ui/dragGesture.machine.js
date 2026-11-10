import { defineMachine } from '../utils/stateMachine.js';

/**
 * The one press that a drag helper follows at a time (`makeDraggable` in `DragDrop.js`, and the food chain builder's
 * `attachLinkGesture`).
 *
 * - `idle`: nothing is pressed.
 * - `pressed`: a pointer is down and has not moved far enough to be a drag. Lifting it is a tap, which the element's own
 *   `click` handles.
 * - `dragging`: it moved past the threshold: a copy (or a line) follows the pointer. Lifting it drops; cancelling it
 *   (Escape, a cancelled pointer, or the element being torn down) abandons the drag.
 *
 * Unlike `engine/pointer-gesture`, a pointer going down while a press is already running is **ignored**, not a
 * replacement: a resting palm or a second finger cannot interrupt the drag in progress.
 */
export const DRAG_GESTURE_MACHINE = defineMachine({
  id: 'engine/drag-gesture',
  initial: 'idle',
  states: {
    idle: { on: { POINTER_DOWN: 'pressed' } },
    pressed: { on: { DRAG_START: 'dragging', POINTER_UP: 'idle', CANCEL: 'idle' } },
    dragging: { on: { POINTER_UP: 'idle', CANCEL: 'idle' } },
  },
});
