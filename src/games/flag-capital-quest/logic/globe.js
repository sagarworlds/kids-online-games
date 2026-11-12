import { GameError } from '../../../engine/utils/errors.js';
import { SCALE, WORLD_WIDTH, MAX_LATITUDE, MIN_LATITUDE } from './projection.js';

/**
 * The geometry of the 3D globe: where a place on the flat map is on the sphere, which way to turn the camera to face it,
 * how far back to stand to see a whole continent, and the path the plane flies. Pure numbers (no three.js), so the maths
 * that decides "is the plane over Brazil?" is tested without a browser.
 *
 * The globe is a sphere of radius 1 with the map wrapped round it, the same way three.js's `SphereGeometry` wraps a
 * picture: the picture's left edge is longitude -180 and its top edge is the north pole. East is to the right when you
 * look at the globe from outside, and the camera orbits it with y up.
 *
 * @typedef {{ x: number, y: number, z: number }} Vector
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect A rectangle of the flat map.
 */

export const GLOBE_RADIUS = 1;
/** The camera's field of view, in degrees; used here to work out distances, and by the scene to build its camera. */
export const FOV = 45;
/** The nearest the camera may come to the globe's middle: close enough to see a small country, never inside the sphere. */
export const MIN_DISTANCE = 1.35;
export const MAX_DISTANCE = 6;
/** Looking straight down on a pole makes "up" ambiguous, so the camera stays this far (radians) from straight up or down. */
export const POLAR_MARGIN = 0.12;

const rad = (degrees) => (degrees * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/** @param {number} lon @param {number} lat @throws {GameError} 'BAD_PLACE' unless both are finite numbers. */
function checkPlace(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new GameError('BAD_PLACE', `a place needs a longitude and a latitude (got ${lon}, ${lat})`, { lon, lat });
}

/**
 * Where a longitude and latitude are on the globe.
 * @param {number} lon Degrees east, -180 to 180.
 * @param {number} lat Degrees north, -90 to 90.
 * @param {number} [radius]
 * @returns {Vector}
 * @throws {GameError} 'BAD_PLACE'.
 */
export function lonLatToPoint(lon, lat, radius = GLOBE_RADIUS) {
  checkPlace(lon, lat);
  const around = rad(lon + 180); // how far round the sphere from the picture's left edge
  const fromPole = rad(90 - lat);
  return {
    x: -radius * Math.cos(around) * Math.sin(fromPole),
    y: radius * Math.cos(fromPole),
    z: radius * Math.sin(around) * Math.sin(fromPole),
  };
}

/**
 * The longitude and latitude of a point on the flat map (the inverse of `project` in projection.js).
 * @param {number} x Map units.
 * @param {number} y Map units.
 * @returns {{ lon: number, lat: number }}
 */
export const mapToLonLat = (x, y) => ({ lon: x / SCALE - 180, lat: MAX_LATITUDE - y / SCALE });

/**
 * Where a country's aim point is on the globe, lifted off the surface by `height`.
 * @param {{ cx: number, cy: number }} anchor In map units.
 * @param {number} [height]
 * @returns {Vector}
 */
export function anchorToPoint({ cx, cy }, height = 0) {
  const { lon, lat } = mapToLonLat(cx, cy);
  return lonLatToPoint(lon, lat, GLOBE_RADIUS + height);
}

/**
 * How the flat map sits in the globe's picture. The picture covers the whole sphere (360 by 180 degrees, twice as wide as
 * tall) but the map only covers the latitudes where countries are, so it is drawn lower than the top edge: the strip above
 * it (the Arctic) and below it (Antarctica) is left plain.
 * @param {number} width The picture's width in pixels.
 * @returns {{ height: number, scale: number, offsetY: number }} `scale` is pixels per map unit; `offsetY` is where the
 *   map's top edge is.
 */
export function texturePlacement(width) {
  const height = width / 2;
  return { height, scale: width / WORLD_WIDTH, offsetY: ((90 - MAX_LATITUDE) / 180) * height };
}

/**
 * The point on the flat map under a spot of the globe's picture.
 * @param {number} u Across the picture, 0 (longitude -180) to 1.
 * @param {number} v Up the picture, 0 (south pole) to 1 (north pole), as three.js reports it.
 * @returns {{ x: number, y: number, onMap: boolean }} `onMap` is false in the polar strips the map does not cover.
 */
export function uvToMapPoint(u, v) {
  const lon = u * 360 - 180;
  const lat = v * 180 - 90;
  return { x: (lon + 180) * SCALE, y: (MAX_LATITUDE - lat) * SCALE, onMap: lat <= MAX_LATITUDE && lat >= MIN_LATITUDE };
}

/**
 * Which way to point the orbit camera to look straight at a place. The camera sits on the line from the middle of the
 * globe through the place: an azimuth `a` and polar angle `p` put it at (sin p sin a, cos p, sin p cos a).
 * @param {number} lon
 * @param {number} lat
 * @returns {{ azimuth: number, polar: number }}
 * @throws {GameError} 'BAD_PLACE'.
 */
export function facingFor(lon, lat) {
  const point = lonLatToPoint(lon, lat);
  return {
    azimuth: Math.atan2(point.x, point.z),
    polar: clamp(Math.acos(clamp(point.y, -1, 1)), POLAR_MARGIN, Math.PI - POLAR_MARGIN),
  };
}

/** @param {Rect} rect @returns {{ lon: number, lat: number }} The middle of a rectangle of the map. */
export function rectCenter(rect) {
  return mapToLonLat(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

/**
 * How far back the camera stands to see the whole globe, whatever the shape of the screen.
 * @param {number} aspect Width divided by height.
 * @param {number} [fovDegrees]
 * @returns {number}
 */
export function wholeGlobeDistance(aspect, fovDegrees = FOV) {
  const tight = Number.isFinite(aspect) && aspect > 0 ? Math.min(aspect, 1) : 1;
  // The sphere's edge is seen at an angle of asin(1 / distance); it must fit inside the narrower half of the view.
  return clamp((1 / Math.sin(rad((fovDegrees / 2)) * tight)) * 1.1, MIN_DISTANCE, MAX_DISTANCE);
}

/**
 * The camera view for a rectangle of the map (a continent, or the whole world): looking at its middle, from far enough
 * back that all of it is in view on a phone held upright or a wide screen, but never farther than the whole globe needs.
 *
 * @param {{ rect: Rect, aspect: number, fovDegrees?: number }} options `aspect` is width divided by height of the view.
 * @returns {{ azimuth: number, polar: number, distance: number }}
 */
export function homeFraming({ rect, aspect, fovDegrees = FOV }) {
  const middle = rectCenter(rect);
  const centerPoint = lonLatToPoint(middle.lon, middle.lat);
  const spanLon = (rect.width / SCALE);
  const spanLat = (rect.height / SCALE);
  // East-west distances shrink towards the poles (a degree of longitude near Iceland is much shorter than at the equator).
  const widthDegrees = Math.max(5, spanLon * Math.cos(rad(middle.lat)));
  const heightDegrees = Math.max(5, spanLat);
  const chord = (degrees) => 2 * Math.sin(rad(Math.min(180, degrees)) / 2);
  const half = Math.tan(rad(fovDegrees / 2));
  const wide = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  // The surface in the middle of the view is (distance - 1) from the camera, so that is the window's reach.
  const reach = 1.12 * Math.max(chord(widthDegrees) / (2 * half * wide), chord(heightDegrees) / (2 * half));
  // A wide box (Asia is 126 degrees across) must also have its far corners on the near side of the globe: the camera sees
  // a point only if the angle from the view's middle to it is under acos(1 / distance), so stand back far enough for that.
  const corners = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]];
  const widest = Math.max(...corners.map(([x, y]) => { const c = mapToLonLat(x, y); return angleBetween(centerPoint, lonLatToPoint(c.lon, c.lat)); }));
  const horizon = 1.05 / Math.cos(Math.min(widest, rad(78)));
  const distance = clamp(Math.max(GLOBE_RADIUS + reach, horizon), MIN_DISTANCE, wholeGlobeDistance(aspect, fovDegrees));
  return { ...facingFor(middle.lon, middle.lat), distance };
}

/**
 * How far a drag as tall as the view should turn the globe so the surface under the finger follows it, however far in the
 * camera is: a close-up turns slowly, a view of the whole globe quickly.
 * @param {number} distance Camera distance from the globe's middle.
 * @param {number} [fovDegrees]
 * @returns {number} Radians per view-height of drag.
 */
export function dragSpeed(distance, fovDegrees = FOV) {
  return Math.max(0.05, 2 * Math.tan(rad(fovDegrees / 2)) * (distance - GLOBE_RADIUS));
}

/**
 * About how many screen pixels one unit of the flat map covers where the camera is looking, which tap resolution needs to
 * give tiny countries a big enough target.
 * @param {{ distance: number, viewHeight: number, fovDegrees?: number }} options `distance` is from the camera to the
 *   surface being tapped; `viewHeight` is in pixels.
 * @returns {number}
 */
export function pixelsPerMapUnit({ distance, viewHeight, fovDegrees = FOV }) {
  const pixelsPerSceneUnit = viewHeight / (2 * Math.max(0.05, distance) * Math.tan(rad(fovDegrees / 2)));
  // One map unit is 360 / 1000 of a degree, which on a sphere of radius 1 is this long.
  return pixelsPerSceneUnit * ((2 * Math.PI) / WORLD_WIDTH);
}

/**
 * How long, in scene units, a number of screen pixels is where the camera is looking. Text and the plane are sized in
 * pixels, so they stay readable whether the child sees the whole globe or one country.
 * @param {{ distance: number, viewHeight: number, fovDegrees?: number }} options `distance` is from the camera to the surface.
 * @returns {number}
 */
export function sceneUnitsPerPixel({ distance, viewHeight, fovDegrees = FOV }) {
  return (2 * Math.max(0.05, distance) * Math.tan(rad(fovDegrees / 2))) / Math.max(1, viewHeight);
}

// ---------------------------------------------------------------------------------------------- the plane's flight

/** @param {Vector} a @param {Vector} b @returns {number} The angle between two unit vectors, in radians. */
export const angleBetween = (a, b) => Math.acos(clamp(dot(a, b), -1, 1));

/**
 * A point part-way along the shortest route over the globe's surface between two places: a great circle, which is the way
 * a real plane flies and why routes look curved on a flat map.
 * @param {Vector} a Unit vector.
 * @param {Vector} b Unit vector.
 * @param {number} t 0 at `a`, 1 at `b`.
 * @returns {Vector} A unit vector.
 */
export function greatCirclePoint(a, b, t) {
  const u = clamp(t, 0, 1);
  const angle = angleBetween(a, b);
  if (angle < 1e-6) return { ...a };
  if (Math.PI - angle < 1e-6) {
    // Exactly opposite: every route is as short as another, so go round by a fixed side.
    const side = Math.abs(a.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const cross = { x: a.y * side.z - a.z * side.y, y: a.z * side.x - a.x * side.z, z: a.x * side.y - a.y * side.x };
    const length = Math.hypot(cross.x, cross.y, cross.z);
    const p = { x: cross.x / length, y: cross.y / length, z: cross.z / length };
    const c = Math.cos(Math.PI * u);
    const s = Math.sin(Math.PI * u);
    return { x: a.x * c + p.x * s, y: a.y * c + p.y * s, z: a.z * c + p.z * s };
  }
  const sin = Math.sin(angle);
  const wa = Math.sin((1 - u) * angle) / sin;
  const wb = Math.sin(u * angle) / sin;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
}

/** How long a flight takes: longer for farther places, never a blink and never a wait. @param {number} angle Radians. @returns {number} Seconds. */
export const flightSeconds = (angle) => clamp(0.7 + angle * 0.9, 0.8, 2.4);

/** How high above the surface the middle of the flight is: a short hop skims, a long one climbs. @param {number} angle Radians. @returns {number} */
export const cruiseHeight = (angle) => 0.035 + 0.1 * (clamp(angle, 0, Math.PI) / Math.PI);

/**
 * How high above the surface the plane is part-way through its flight: on the ground at both ends, highest in the middle.
 * @param {number} t 0 to 1.
 * @param {number} cruise The height of the middle, from `cruiseHeight`.
 * @returns {number}
 */
export function flightHeight(t, cruise) {
  const u = clamp(t, 0, 1);
  // sin(PI) is 1.2e-16, not 0: set the ends exactly so the plane lands exactly.
  return u === 0 || u === 1 ? 0 : cruise * Math.sin(Math.PI * u);
}

/** @param {Vector} v @returns {{ lon: number, lat: number }} The longitude and latitude of a point on the globe's surface (the inverse of `lonLatToPoint`). */
export function pointToLonLat(v) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  const around = Math.atan2(v.z, -v.x); // from the picture's left edge, in radians
  let lon = deg(around) - 180;
  if (lon < -180) lon += 360;
  return { lon, lat: deg(Math.asin(clamp(v.y / length, -1, 1))) };
}
