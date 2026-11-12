import { Stage3D } from './Stage3D.js';
import { OrbitInput } from './OrbitInput.js';
import { approach, shortestTurn } from './motionMath.js';

/**
 * A `Stage3D` with an orbit camera the child turns and zooms, and that can also glide to a new view by itself ("whole
 * board", "look at Mars") or follow something every frame (a robot's-eye camera). Every 3D version of a game needs this,
 * so it is written once; a game adds its own scenery and rules on top (see `SpaceStage` in Planet Hop).
 *
 * A scene creates one in `enter()`, calls `update(dt)` and `render()` from its own hooks, and `dispose()` from `exit()`.
 * Creating it can throw 'WEBGL_UNAVAILABLE', which the game turns into its 2D version.
 *
 * @typedef {{ x: number, y: number, z: number }} Point
 * @typedef {{ azimuth?: number, polar?: number, distance: number, target: Point }} CameraGoal
 *   Angles left out keep whatever the child has turned the camera to.
 */

export class OrbitStage {
  /** @type {Stage3D} */
  stage;
  /** @type {OrbitInput} */
  input;

  #motion = OrbitStage.#watchMotion();
  /** @type {CameraGoal|null} */
  #goal = null;
  #disposed = false;

  /**
   * @param {{
   *   container: HTMLElement,
   *   label: string,
   *   background?: string|number|null,
   *   fov?: number, near?: number, far?: number,
   *   orbit: import('./orbitMath.js').Orbit | ((stage: Stage3D) => import('./orbitMath.js').Orbit),
   *   limits: import('./orbitMath.js').OrbitLimits,
   *   target?: Point,
   *   onContextLost: () => void,
   *   onTap?: (point: { clientX: number, clientY: number }) => void
   * }} options `container` is an element with a size from CSS. `label` is what a screen reader says about the picture.
   *   `orbit` may be a function of the new stage, for a starting distance that depends on the view's shape.
   * @throws {import('../utils/errors.js').GameError} 'WEBGL_UNAVAILABLE' (from `Stage3D`).
   */
  constructor({ container, label, background = null, fov = 50, near = 0.05, far = 400, orbit, limits, target = { x: 0, y: 0, z: 0 }, onContextLost, onTap }) {
    this.stage = new Stage3D({ container, background, fov, near, far, label, onContextLost });
    try {
      this.input = new OrbitInput({
        element: this.stage.canvas,
        orbit: typeof orbit === 'function' ? orbit(this.stage) : orbit,
        limits,
        target,
        // The child took the camera: whatever view it was gliding to is no longer wanted.
        onChange: () => { this.#goal = null; },
        onTap,
      });
    } catch (error) {
      // The stage already put a canvas in the page; give it back before the failure moves on.
      this.stage.dispose();
      throw error;
    }
  }

  static #watchMotion() {
    try {
      return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false };
    } catch {
      return { matches: false };
    }
  }

  /** @returns {boolean} True when the child's device asks for less motion: nothing spins, flies or glides then. */
  get reducedMotion() {
    return this.#motion.matches;
  }

  /**
   * Glides the camera to a new view and stops there. If the child touches the camera on the way, the glide is dropped.
   * @param {CameraGoal} goal
   */
  glideTo(goal) {
    this.#goal = goal;
  }

  /**
   * Moves the camera on by one frame towards a goal that may change every frame (a camera that rides along behind a
   * moving thing). Unlike `glideTo` it never ends by itself; the caller stops calling it.
   * @param {CameraGoal} goal
   * @param {number} dt Seconds since the last frame.
   * @param {number} [rate] How quickly it catches up; higher is stiffer.
   */
  follow(goal, dt, rate = 4.5) {
    this.#step(goal, dt, rate);
  }

  /**
   * Advances an unfinished glide by one frame. Call it every frame.
   * @param {number} dt Seconds since the last frame.
   */
  update(dt) {
    if (!this.#goal) return;
    if (this.#step(this.#goal, dt, 4.5)) this.#goal = null;
  }

  /** @returns {boolean} True once the camera is exactly at the goal. */
  #step(goal, dt, rate) {
    const reduced = this.reducedMotion;
    const { orbit, target } = this.input;
    const move = (from, to) => (reduced ? to : approach(from, to, dt, rate));
    const azimuth = goal.azimuth === undefined ? orbit.azimuth : move(orbit.azimuth, orbit.azimuth + shortestTurn(orbit.azimuth, goal.azimuth));
    const polar = goal.polar === undefined ? orbit.polar : move(orbit.polar, goal.polar);
    const distance = move(orbit.distance, goal.distance);
    const next = { x: move(target.x, goal.target.x), y: move(target.y, goal.target.y), z: move(target.z, goal.target.z) };
    // Assigned directly (not through `input.set`) because `set` would count as the child touching the camera.
    this.input.orbit = { azimuth, polar, distance };
    this.input.target = next;
    return (goal.polar === undefined || polar === goal.polar) && distance === goal.distance
      && next.x === goal.target.x && next.y === goal.target.y && next.z === goal.target.z
      // An angle arrives "the short way round", so it can be a whole turn away from the goal's number: compare the turn.
      && (goal.azimuth === undefined || Math.abs(shortestTurn(azimuth, goal.azimuth)) < 1e-9);
  }

  /** Draws the frame: puts the camera where the orbit says, then renders. */
  render() {
    if (this.#disposed) return;
    this.input.apply(this.stage.camera);
    this.stage.render();
  }

  /** Frees the camera listeners and the graphics memory. Safe to call twice. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.input?.dispose();
    this.stage.dispose();
  }
}
