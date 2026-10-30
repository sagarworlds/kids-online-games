import { DRAG_THRESHOLD, exceedsThreshold, zoneAtPoint } from '../utils/dragMath.js';

/** How long a rejected piece takes to slide back to where it started. */
const SNAP_BACK_MS = 180;

/**
 * Makes an element draggable with a pointer (mouse, touch or pen) *and* usable without dragging at all.
 *
 * - **Drag**: press, move past a small threshold, and a copy of the element follows the pointer. On release over one
 *   of `getZones()` the `onDrop` callback decides: return `false` to refuse, and the copy glides back to the start
 *   ("snap-back"). Released anywhere else it always snaps back.
 * - **Tap / keyboard**: a click without a drag, or Enter / Space on the focused element (a `<button>` turns those into
 *   a click), calls `onActivate`. This is the keyboard alternative the spec requires, and it also makes a plain tap
 *   work on touch screens, where dragging is fiddly.
 * - Escape or a cancelled pointer (an incoming call, say) abandons the drag with a snap-back.
 *
 * Why the element's own `click` is used for activation and not `pointerup`: it is the one event every input method
 * raises, so screen readers and switch devices work for free.
 *
 * @param {HTMLElement} node Should be a `<button>` so it is focusable and keyboard-activatable.
 * @param {{
 *   getZones: () => readonly HTMLElement[],
 *   onDrop: (zone: HTMLElement, node: HTMLElement) => boolean|void,
 *   onActivate?: (node: HTMLElement) => void,
 *   onDragStart?: (node: HTMLElement) => void,
 *   onDragEnd?: (node: HTMLElement) => void,
 *   threshold?: number
 * }} options
 * @returns {{ destroy: () => void }} Detaches every listener.
 */
export function makeDraggable(node, { getZones, onDrop, onActivate, onDragStart, onDragEnd, threshold = DRAG_THRESHOLD }) {
  /** @type {{ pointerId: number, start: { x: number, y: number }, offset: { x: number, y: number }, ghost: HTMLElement|null, over: HTMLElement|null }|null} */
  let press = null;
  let suppressClick = false;

  node.classList.add('dd-item');

  const zoneBoxes = () => getZones().map((element) => ({ element, ...element.getBoundingClientRect().toJSON() }));

  function setOver(p, zone) {
    if (p.over === zone) return;
    p.over?.classList.remove('is-over');
    zone?.classList.add('is-over');
    p.over = zone;
  }

  function startDrag() {
    const box = node.getBoundingClientRect();
    const ghost = /** @type {HTMLElement} */ (node.cloneNode(true));
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;
    ghost.classList.add('dd-ghost');
    ghost.style.width = `${box.width}px`;
    ghost.style.height = `${box.height}px`;
    document.body.append(ghost);
    press.ghost = ghost;
    press.offset = { x: press.start.x - box.left, y: press.start.y - box.top };
    node.classList.add('is-dragging');
    document.addEventListener('keydown', onEscape);
    onDragStart?.(node);
  }

  function moveGhost(x, y) {
    press.ghost.style.transform = `translate(${x - press.offset.x}px, ${y - press.offset.y}px)`;
  }

  function onPointerDown(event) {
    if (press || (event.pointerType === 'mouse' && event.button !== 0)) return;
    press = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, offset: { x: 0, y: 0 }, ghost: null, over: null };
    // Capture keeps move/up events coming to this node even when the pointer leaves it (and the page, on desktop).
    node.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!press.ghost) {
      if (!exceedsThreshold(press.start, point, threshold)) return;
      startDrag();
    }
    moveGhost(point.x, point.y);
    setOver(press, zoneAtPoint(zoneBoxes(), point.x, point.y)?.element ?? null);
  }

  function onPointerUp(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    const ended = press;
    // Detach first: `onDrop` often redraws the screen and so calls `destroy()` on this very element, which must not
    // find a half-finished drag and end it a second time.
    press = null;
    if (!ended.ghost) return; // a tap: the click event that follows calls onActivate
    const zone = zoneAtPoint(zoneBoxes(), event.clientX, event.clientY)?.element ?? null;
    finish(ended, zone ? onDrop(zone, node) !== false : false);
  }

  function onEscape(event) {
    if (event.key !== 'Escape' || !press?.ghost) return;
    const ended = press;
    press = null;
    finish(ended, false);
  }

  /** Ends a drag. `accepted` false means the copy slides back to the start before disappearing. */
  function finish(ended, accepted) {
    const { ghost } = ended;
    setOver(ended, null);
    document.removeEventListener('keydown', onEscape);
    node.classList.remove('is-dragging');
    // The click that follows a real drag must not also count as a tap.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (accepted) {
      ghost.remove();
    } else {
      const home = node.getBoundingClientRect();
      ghost.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`;
      ghost.style.transform = `translate(${home.left}px, ${home.top}px)`;
      setTimeout(() => ghost.remove(), SNAP_BACK_MS + 20);
    }
    onDragEnd?.(node);
  }

  function onPointerCancel(event) {
    if (!press || event.pointerId !== press.pointerId) return;
    const ended = press;
    press = null;
    if (ended.ghost) finish(ended, false);
  }

  function onClick(event) {
    if (suppressClick) {
      event.preventDefault();
      return;
    }
    onActivate?.(node);
  }

  node.style.touchAction = 'none'; // otherwise the browser scrolls the page instead of dragging
  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerCancel);
  node.addEventListener('click', onClick);

  return {
    destroy() {
      if (press?.ghost) {
        const ended = press;
        press = null;
        finish(ended, false);
      }
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerCancel);
      node.removeEventListener('click', onClick);
      node.classList.remove('dd-item');
    },
  };
}
