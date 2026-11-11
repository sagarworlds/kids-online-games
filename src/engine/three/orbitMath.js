/**
 * Maths for a camera that circles a point ("orbit" camera): drag to turn, pinch to zoom.
 * Pure functions, so the limits that keep a child from getting lost are unit-tested.
 *
 * Angles are in radians. `azimuth` turns around the vertical axis; `polar` is the angle down from
 * straight above (0 = looking down from the top, PI/2 = level with the target).
 */

/**
 * @typedef {{ azimuth: number, polar: number, distance: number }} Orbit
 * @typedef {{
 *   minPolar: number, maxPolar: number, minDistance: number, maxDistance: number,
 *   minAzimuth?: number, maxAzimuth?: number
 * }} OrbitLimits  Leave the azimuth limits out to allow turning all the way round.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Keeps an orbit inside its limits. The polar limits stop the camera flipping over the top or going
 * under the floor; the distance limits stop it entering the model or losing it in the distance.
 * @param {Orbit} orbit
 * @param {OrbitLimits} limits
 * @returns {Orbit}
 */
export function clampOrbit(orbit, limits) {
  const hasAzimuthLimits = Number.isFinite(limits.minAzimuth) && Number.isFinite(limits.maxAzimuth);
  return {
    azimuth: hasAzimuthLimits ? clamp(orbit.azimuth, limits.minAzimuth, limits.maxAzimuth) : orbit.azimuth,
    polar: clamp(orbit.polar, limits.minPolar, limits.maxPolar),
    distance: clamp(orbit.distance, limits.minDistance, limits.maxDistance),
  };
}

/**
 * Turns the camera for a drag of (dx, dy) CSS pixels.
 * The drag is divided by the view height so a full-height swipe always turns by `speed` radians,
 * whether on a phone or a desktop monitor.
 * @param {Orbit} orbit
 * @param {number} dx
 * @param {number} dy
 * @param {{ viewHeight: number, limits: OrbitLimits, speed?: number }} options
 * @returns {Orbit}
 */
export function rotateOrbit(orbit, dx, dy, { viewHeight, limits, speed = Math.PI }) {
  const scale = speed / Math.max(1, viewHeight);
  return clampOrbit(
    { ...orbit, azimuth: orbit.azimuth - dx * scale, polar: orbit.polar - dy * scale },
    limits,
  );
}

/**
 * Zooms by a factor: below 1 moves closer, above 1 moves away (a pinch passes startGap / currentGap).
 * @param {Orbit} orbit
 * @param {number} factor
 * @param {OrbitLimits} limits
 * @returns {Orbit}
 */
export function zoomOrbit(orbit, factor, limits) {
  if (!Number.isFinite(factor) || factor <= 0) return orbit;
  return clampOrbit({ ...orbit, distance: orbit.distance * factor }, limits);
}

/**
 * Camera position for an orbit around `target` (y is up).
 * @param {Orbit} orbit
 * @param {{ x: number, y: number, z: number }} [target]
 * @returns {{ x: number, y: number, z: number }}
 */
export function orbitPosition(orbit, target = { x: 0, y: 0, z: 0 }) {
  const ring = orbit.distance * Math.sin(orbit.polar);
  return {
    x: target.x + ring * Math.sin(orbit.azimuth),
    y: target.y + orbit.distance * Math.cos(orbit.polar),
    z: target.z + ring * Math.cos(orbit.azimuth),
  };
}

/**
 * Distance between two touch points, used for pinch zoom.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
export function pinchGap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
