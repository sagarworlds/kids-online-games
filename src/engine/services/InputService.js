/**
 * @typedef {'tap'|'dragstart'|'drag'|'dragend'|'key'|'visibility'} InputEventType
 *
 * Payloads:
 * - tap / dragstart / drag / dragend: `{ x, y, dx, dy, pointerType, onInteractive, originalEvent }`
 *   with x/y relative to the target element's top-left corner.
 * - key: `{ key, code, repeat, fromInteractive, originalEvent }`
 * - visibility: `{ hidden }`
 *
 * `onInteractive` / `fromInteractive` tell a scene the event came from a real
 * button or link, which the browser already handles. Canvas scenes should
 * ignore such taps, and ignore Enter/Space from them so one press never acts twice.
 */

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"]';
const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]';

/**
 * Translates pointer (mouse, touch, pen) and keyboard input into a few simple
 * events so scenes never deal with raw DOM events.
 */
export class InputService {
  #target;
  #keyTarget;
  #doc;
  #dragThreshold;
  #handlers = new Map();
  #pointer = null;
  #disposers = [];

  /**
   * @param {{
   *   target: HTMLElement, keyTarget?: EventTarget, doc?: Document, dragThreshold?: number
   * }} options `dragThreshold` is the distance in px before a press counts as a drag.
   */
  constructor({ target, keyTarget = globalThis.document, doc = globalThis.document, dragThreshold = 8 }) {
    this.#target = target;
    this.#keyTarget = keyTarget;
    this.#doc = doc;
    this.#dragThreshold = dragThreshold;
    this.#listen(target, 'pointerdown', (e) => this.#onDown(e));
    this.#listen(target, 'pointermove', (e) => this.#onMove(e));
    this.#listen(target, 'pointerup', (e) => this.#onUp(e));
    this.#listen(target, 'pointercancel', (e) => this.#onCancel(e));
    this.#listen(keyTarget, 'keydown', (e) => this.#onKey(e));
    this.#listen(doc, 'visibilitychange', () => this.emit('visibility', { hidden: Boolean(doc.hidden) }));
  }

  /**
   * @param {InputEventType} type
   * @param {(payload: any) => void} handler
   * @returns {() => void} Call to unsubscribe.
   */
  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(handler);
    return () => this.#handlers.get(type)?.delete(handler);
  }

  /**
   * Delivers an event to subscribers. Public so tests and other services can
   * synthesise input. A throwing handler does not stop the others.
   * @param {InputEventType} type
   * @param {object} payload
   */
  emit(type, payload) {
    for (const handler of [...(this.#handlers.get(type) ?? [])]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[input] handler for "${type}" threw`, error);
      }
    }
  }

  /** Removes every DOM listener. Call when the page is torn down. */
  dispose() {
    for (const off of this.#disposers) off();
    this.#disposers = [];
    this.#handlers.clear();
  }

  #listen(target, type, handler) {
    target.addEventListener(type, handler);
    this.#disposers.push(() => target.removeEventListener(type, handler));
  }

  #position(event) {
    const rect = this.#target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  #payload(event, extra = {}) {
    const { x, y } = this.#position(event);
    return {
      x,
      y,
      dx: 0,
      dy: 0,
      pointerType: event.pointerType ?? 'mouse',
      onInteractive: Boolean(event.target?.closest?.(INTERACTIVE)),
      originalEvent: event,
      ...extra,
    };
  }

  #onDown(event) {
    if (event.button !== undefined && event.button > 0) return; // primary button only
    this.#pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
  }

  #onMove(event) {
    const p = this.#pointer;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.startX;
    const dy = event.clientY - p.startY;
    if (!p.dragging && Math.hypot(dx, dy) >= this.#dragThreshold) {
      p.dragging = true;
      this.emit('dragstart', this.#payload(event, { dx, dy }));
    }
    if (p.dragging) this.emit('drag', this.#payload(event, { dx, dy }));
  }

  #onUp(event) {
    const p = this.#pointer;
    if (!p || p.id !== event.pointerId) return;
    this.#pointer = null;
    const dx = event.clientX - p.startX;
    const dy = event.clientY - p.startY;
    this.emit(p.dragging ? 'dragend' : 'tap', this.#payload(event, { dx, dy }));
  }

  #onCancel(event) {
    const p = this.#pointer;
    if (!p || p.id !== event.pointerId) return;
    this.#pointer = null;
    if (p.dragging) this.emit('dragend', this.#payload(event, { cancelled: true }));
  }

  #onKey(event) {
    // Typing into a real text field (e.g. the grown-up check) is not game input.
    if (event.target?.closest?.(TEXT_FIELD)) return;
    // Leave browser/OS shortcuts (Ctrl+R, Cmd+L...) alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    this.emit('key', {
      key: event.key,
      code: event.code,
      repeat: Boolean(event.repeat),
      fromInteractive: Boolean(event.target?.closest?.(INTERACTIVE)),
      originalEvent: event,
    });
  }
}
