import { Stage3D } from '../../../engine/three/Stage3D.js';
import { OrbitInput } from '../../../engine/three/OrbitInput.js';
import { createSizer } from '../logic/scale.js';
import { approach, shortestTurn } from '../logic/motion3d.js';
import { outerRadius, overviewDistance } from '../logic/space3d.js';
import { SolarSystem } from './SolarSystem.js';

/**
 * What both 3D scenes need to show the solar system: a `Stage3D`, the scenery, and an orbit camera that the child
 * turns and zooms and that can also glide to a new view by itself ("whole system", "look at Mars").
 *
 * A scene creates one in `enter()` (or later), calls `update(dt)` and `render()` from its own hooks, and `dispose()`
 * from `exit()`. Creating it can throw 'WEBGL_UNAVAILABLE', which the caller turns into the 2D version.
 *
 * @typedef {{ x: number, y: number, z: number }} Point
 * @typedef {{ azimuth?: number, polar?: number, distance: number, target: Point }} CameraGoal
 */

/** Looking down on the orbits at an angle: from straight above the planets are flat circles with no feeling of depth. */
const OVERVIEW_ANGLES = Object.freeze({ azimuth: 0.35, polar: 1.0 });
/** The limits keep the child from flipping upside down, going under the orbits, or losing the system in space. */
const LIMITS = Object.freeze({ minPolar: 0.12, maxPolar: 1.52, minDistance: 0.5, maxDistance: 70 });
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });
const FOV = 50;

export class SpaceStage {
  /** @type {Stage3D} */
  stage;
  /** @type {SolarSystem} */
  system;
  /** @type {OrbitInput} */
  input;

  #planetCount;
  /** The "less motion" setting, kept as a live object so reading it each frame costs nothing. */
  #motion = SpaceStage.#watchMotion();
  /** @type {CameraGoal|null} */
  #goal = null;
  #disposed = false;

  /**
   * @param {{
   *   container: HTMLElement,
   *   planets: readonly { radiusKm: number }[],
   *   label: string,
   *   real?: boolean,
   *   onContextLost: () => void,
   *   onTap: (point: { clientX: number, clientY: number }) => void
   * }} options `container` is an element with a size from CSS. `planets` gives the size scale (the same one the 2D
   *   pictures use). `label` is what a screen reader says about the picture.
   * @throws {import('../../../engine/utils/errors.js').GameError} 'WEBGL_UNAVAILABLE' (from `Stage3D`).
   */
  constructor({ container, planets, label, real = false, onContextLost, onTap }) {
    this.#planetCount = planets.length;
    this.stage = new Stage3D({ container, background: '#070b24', fov: FOV, near: 0.05, far: 400, label, onContextLost });
    try {
      this.system = new SolarSystem({ scene: this.stage.scene, quality: this.stage.quality, sizer: createSizer(planets, { real }) });
      this.input = new OrbitInput({
        element: this.stage.canvas,
        orbit: { ...OVERVIEW_ANGLES, distance: this.overviewDistance() },
        limits: LIMITS,
        target: ORIGIN,
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

  /** @returns {number} The distance at which the whole system fits this view's shape. */
  overviewDistance() {
    const { width, height } = this.stage.size;
    return overviewDistance({ aspect: width / height, outer: outerRadius(this.#planetCount), fovDegrees: FOV });
  }

  /** Glides to the view of the whole system, from the usual angle. */
  showWholeSystem() {
    this.glideTo({ ...OVERVIEW_ANGLES, distance: this.overviewDistance(), target: ORIGIN });
  }

  /**
   * Glides the camera to a new view. Only the parts named in `goal` move the angles; the child's own turning is kept
   * when `azimuth` and `polar` are left out.
   * @param {CameraGoal} goal
   */
  glideTo(goal) {
    this.#goal = goal;
  }

  /**
   * Moves the camera and the scenery on by one frame.
   * @param {number} dt Seconds since the last frame.
   */
  update(dt) {
    const reducedMotion = this.reducedMotion;
    this.system.update(dt, { reducedMotion });
    if (this.#goal) this.#glide(dt, reducedMotion);
  }

  #glide(dt, reducedMotion) {
    const goal = this.#goal;
    const { orbit, target } = this.input;
    const step = (from, to) => (reducedMotion ? to : approach(from, to, dt, 4.5));
    const azimuth = goal.azimuth === undefined ? orbit.azimuth : step(orbit.azimuth, orbit.azimuth + shortestTurn(orbit.azimuth, goal.azimuth));
    const polar = goal.polar === undefined ? orbit.polar : step(orbit.polar, goal.polar);
    const distance = step(orbit.distance, goal.distance);
    const next = { x: step(target.x, goal.target.x), y: step(target.y, goal.target.y), z: step(target.z, goal.target.z) };
    // Assigned directly (not through `input.set`) because `set` would count as the child touching the camera.
    this.input.orbit = { azimuth, polar, distance };
    this.input.target = next;
    const arrived = (goal.polar === undefined || polar === goal.polar) && distance === goal.distance
      && next.x === goal.target.x && next.y === goal.target.y && next.z === goal.target.z
      // An angle arrives "the short way round", so it can be a whole turn away from the goal's number: compare the turn.
      && (goal.azimuth === undefined || Math.abs(shortestTurn(azimuth, goal.azimuth)) < 1e-9);
    if (arrived) this.#goal = null;
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
