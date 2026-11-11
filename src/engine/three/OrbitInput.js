import { clampOrbit, orbitPosition, pinchGap, rotateOrbit, zoomOrbit } from './orbitMath.js';

/** A press that moves less than this many CSS pixels is a tap, not a drag (fingers are never perfectly still). */
const TAP_SLOP = 8;
const KEY_TURN = Math.PI / 18; // 10 degrees per arrow-key press

/**
 * Touch, mouse and keyboard control for an orbit camera: one finger (or mouse drag) turns, two fingers
 * pinch to zoom, the wheel zooms, arrow keys turn and + / - zoom. A press that does not move is
 * reported as a tap so the scene can use it for picking objects.
 *
 * The scene owns the camera; this class only keeps the orbit numbers up to date and applies them.
 */
export class OrbitInput {
  /** @type {import('./orbitMath.js').Orbit} */
  orbit;
  target = { x: 0, y: 0, z: 0 };
  /** Set to false to freeze the camera, for example while a cut-scene plays. */
  enabled = true;

  #element;
  #limits;
  #onChange;
  #onTap;
  #pointers = new Map();
  #moved = 0;
  #lastGap = 0;
  #listeners = [];

  /**
   * @param {{
   *   element: HTMLElement,
   *   orbit: import('./orbitMath.js').Orbit,
   *   limits: import('./orbitMath.js').OrbitLimits,
   *   target?: { x: number, y: number, z: number },
   *   onChange?: () => void,
   *   onTap?: (point: { clientX: number, clientY: number }) => void
   * }} options `element` is usually `stage.canvas`.
   */
  constructor({ element, orbit, limits, target, onChange, onTap }) {
    this.#element = element;
    this.#limits = limits;
    this.orbit = clampOrbit(orbit, limits);
    if (target) this.target = { ...target };
    this.#onChange = onChange ?? (() => {});
    this.#onTap = onTap ?? (() => {});

    // Focusable so the arrow keys work for keyboard players.
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
    this.#listen('pointerdown', (e) => this.#down(e));
    this.#listen('pointermove', (e) => this.#move(e));
    this.#listen('pointerup', (e) => this.#up(e, true));
    this.#listen('pointercancel', (e) => this.#up(e, false));
    this.#listen('wheel', (e) => this.#wheel(e), { passive: false });
    this.#listen('keydown', (e) => this.#key(e));
  }

  /**
   * Moves a three.js camera to the current orbit and points it at the target.
   * @param {import('./three.js').Camera} camera
   */
  apply(camera) {
    const p = orbitPosition(this.orbit, this.target);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(this.target.x, this.target.y, this.target.z);
  }

  /**
   * Replaces the orbit (clamped to the limits), for example to reset the view.
   * @param {Partial<import('./orbitMath.js').Orbit>} patch
   */
  set(patch) {
    this.orbit = clampOrbit({ ...this.orbit, ...patch }, this.#limits);
    this.#onChange();
  }

  /** Removes every listener. Call from the scene's `exit()`. */
  dispose() {
    for (const [type, handler, options] of this.#listeners) this.#element.removeEventListener(type, handler, options);
    this.#listeners = [];
    this.#pointers.clear();
  }

  #listen(type, handler, options) {
    this.#element.addEventListener(type, handler, options);
    this.#listeners.push([type, handler, options]);
  }

  #down(event) {
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Capture keeps the drag alive when the finger slides off the canvas.
    this.#element.setPointerCapture?.(event.pointerId);
    if (this.#pointers.size === 1) this.#moved = 0;
    if (this.#pointers.size === 2) {
      this.#lastGap = this.#gap();
      this.#moved = TAP_SLOP + 1; // a second finger means this is no longer a tap
    }
  }

  #move(event) {
    const previous = this.#pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!this.enabled) return;

    if (this.#pointers.size >= 2) {
      const gap = this.#gap();
      if (gap > 0 && this.#lastGap > 0) {
        // Fingers moving apart make the gap grow, which should bring the camera closer.
        this.orbit = zoomOrbit(this.orbit, this.#lastGap / gap, this.#limits);
        this.#onChange();
      }
      this.#lastGap = gap;
      return;
    }

    this.#moved += Math.abs(dx) + Math.abs(dy);
    if (this.#moved <= TAP_SLOP) return;
    const viewHeight = this.#element.getBoundingClientRect().height;
    this.orbit = rotateOrbit(this.orbit, dx, dy, { viewHeight, limits: this.#limits });
    this.#onChange();
  }

  #up(event, completed) {
    if (!this.#pointers.has(event.pointerId)) return;
    const wasSingle = this.#pointers.size === 1;
    this.#pointers.delete(event.pointerId);
    this.#element.releasePointerCapture?.(event.pointerId);
    if (completed && wasSingle && this.#moved <= TAP_SLOP) {
      this.#onTap({ clientX: event.clientX, clientY: event.clientY });
    }
  }

  #wheel(event) {
    if (!this.enabled) return;
    event.preventDefault(); // otherwise the page scrolls while the child zooms
    this.orbit = zoomOrbit(this.orbit, event.deltaY > 0 ? 1.1 : 1 / 1.1, this.#limits);
    this.#onChange();
  }

  #key(event) {
    if (!this.enabled) return;
    const turns = { ArrowLeft: [KEY_TURN, 0], ArrowRight: [-KEY_TURN, 0], ArrowUp: [0, -KEY_TURN], ArrowDown: [0, KEY_TURN] };
    const turn = turns[event.key];
    if (turn) {
      this.orbit = clampOrbit(
        { ...this.orbit, azimuth: this.orbit.azimuth + turn[0], polar: this.orbit.polar + turn[1] },
        this.#limits,
      );
    } else if (event.key === '+' || event.key === '=') {
      this.orbit = zoomOrbit(this.orbit, 1 / 1.15, this.#limits);
    } else if (event.key === '-' || event.key === '_') {
      this.orbit = zoomOrbit(this.orbit, 1.15, this.#limits);
    } else {
      return;
    }
    event.preventDefault();
    this.#onChange();
  }

  #gap() {
    const [a, b] = [...this.#pointers.values()];
    return a && b ? pinchGap(a, b) : 0;
  }
}
