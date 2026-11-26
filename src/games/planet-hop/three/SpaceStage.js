import { OrbitStage } from '../../../engine/three/OrbitStage.js';
import { createSizer } from '../logic/scale.js';
import { outerRadius, overviewDistance } from '../logic/space3d.js';
import { SolarSystem } from './SolarSystem.js';

/**
 * What both Planet Hop 3D scenes need to show the solar system: the shared orbit-camera stage (`OrbitStage`) plus the
 * scenery from `SolarSystem`, and the camera views that belong to it ("whole system").
 *
 * A scene creates one in `enter()` (or later), calls `update(dt)` and `render()` from its own hooks, and `dispose()`
 * from `exit()`. Creating it can throw 'WEBGL_UNAVAILABLE', which the caller turns into the 2D version.
 */

/** Looking down on the orbits at an angle: from straight above the planets are flat circles with no feeling of depth. */
const OVERVIEW_ANGLES = Object.freeze({ azimuth: 0.35, polar: 1.0 });
/** The limits keep the child from flipping upside down, going under the orbits, or losing the system in space. */
const LIMITS = Object.freeze({ minPolar: 0.12, maxPolar: 1.52, minDistance: 0.5, maxDistance: 70 });
const FOV = 50;

export class SpaceStage extends OrbitStage {
  /** @type {SolarSystem} */
  system;
  #planetCount;

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
    const count = planets.length;
    super({
      container, label, background: '#070b24', fov: FOV, limits: LIMITS, onContextLost, onTap,
      orbit: (stage) => ({ ...OVERVIEW_ANGLES, distance: SpaceStage.#fit(stage.size, count) }),
    });
    this.#planetCount = count;
    try {
      this.system = new SolarSystem({ scene: this.stage.scene, quality: this.stage.quality, sizer: createSizer(planets, { real }) });
    } catch (error) {
      super.dispose();
      throw error;
    }
  }

  static #fit({ width, height }, planetCount) {
    return overviewDistance({ aspect: width / height, outer: outerRadius(planetCount), fovDegrees: FOV });
  }

  /** @returns {number} The distance at which the whole system fits this view's shape. */
  overviewDistance() {
    return SpaceStage.#fit(this.stage.size, this.#planetCount);
  }

  /** Glides to the view of the whole system, from the usual angle. */
  showWholeSystem() {
    this.glideTo({ ...OVERVIEW_ANGLES, distance: this.overviewDistance(), target: { x: 0, y: 0, z: 0 } });
  }

  /**
   * Moves the scenery and the camera on by one frame.
   * @param {number} dt Seconds since the last frame.
   */
  update(dt) {
    this.system.update(dt, { reducedMotion: this.reducedMotion });
    super.update(dt);
  }
}
