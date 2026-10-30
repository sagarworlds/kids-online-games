/**
 * The maths of the pan-and-zoom map, with no screen attached. The visible part of the map is a rectangle `view` in map
 * units (the SVG's viewBox); zooming makes it smaller, panning moves it.
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} View
 * @typedef {{ world: View, minWidth: number }} Limits  The whole map, and how far in you may zoom.
 */

/** You can zoom in until the view is this wide (about fifty times closer than the world). */
export const MIN_VIEW_WIDTH = 18;
/** Every tap target on a country is at least this many pixels in radius, whatever the zoom. */
export const MIN_HIT_RADIUS_PX = 24;

/**
 * Grows a rectangle (about its centre) until it has the shape of the screen area, so the map fills it without
 * stretching. The map is never cropped: a wide rectangle gets taller, a tall one gets wider.
 * @param {View} rect
 * @param {number} aspect Width divided by height of the screen area.
 * @returns {View}
 */
export function fitToAspect(rect, aspect) {
  const current = rect.width / rect.height;
  if (current < aspect) {
    const width = rect.height * aspect;
    return { x: rect.x - (width - rect.width) / 2, y: rect.y, width, height: rect.height };
  }
  const height = rect.width / aspect;
  return { x: rect.x, y: rect.y - (height - rect.height) / 2, width: rect.width, height };
}

/**
 * Keeps the view inside the world: the centre may not leave the map, and the view may not be zoomed out past the whole
 * world or in past the limit. Aspect ratio is kept.
 * @param {View} view
 * @param {Limits} limits
 * @returns {View}
 */
export function clampView(view, { world, minWidth }) {
  const aspect = view.width / view.height;
  const maxWidth = Math.max(world.width, world.height * aspect);
  const width = Math.min(Math.max(view.width, minWidth), maxWidth);
  const height = width / aspect;
  const cx = Math.min(Math.max(view.x + view.width / 2, world.x), world.x + world.width);
  const cy = Math.min(Math.max(view.y + view.height / 2, world.y), world.y + world.height);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/**
 * Zooms by `factor` (above 1 zooms in) keeping the map point under `anchor` where it is on screen, which is what
 * pinching, the mouse wheel and the buttons (anchored at the middle) all need.
 * @param {View} view
 * @param {number} factor
 * @param {{ x: number, y: number }} anchor In map units.
 * @param {Limits} limits
 * @returns {View}
 */
export function zoomAt(view, factor, anchor, limits) {
  const width = view.width / factor;
  const height = view.height / factor;
  const fx = (anchor.x - view.x) / view.width;
  const fy = (anchor.y - view.y) / view.height;
  return clampView({ x: anchor.x - fx * width, y: anchor.y - fy * height, width, height }, limits);
}

/**
 * Moves the view by a distance in map units (positive dx moves the view right, which drags the map left).
 * @param {View} view
 * @param {number} dx
 * @param {number} dy
 * @param {Limits} limits
 * @returns {View}
 */
export const panBy = (view, dx, dy, limits) => clampView({ ...view, x: view.x + dx, y: view.y + dy }, limits);

/**
 * A two-finger pinch: the view at the start, how far apart the fingers were then and are now, and where their middle
 * was then and is now (in map units). Zooms by the change in distance and follows the middle, so the map stays under the
 * fingers.
 * @param {View} start
 * @param {number} startDistance
 * @param {number} distance
 * @param {{ x: number, y: number }} startMiddle Map units, in the starting view.
 * @param {{ x: number, y: number }} middle Where the fingers' middle is now, as a fraction (0 to 1) of the screen area.
 * @param {Limits} limits
 * @returns {View}
 */
export function pinchView(start, startDistance, distance, startMiddle, middle, limits) {
  if (startDistance <= 0 || distance <= 0) return start;
  const width = start.width / (distance / startDistance);
  const height = start.height / (distance / startDistance);
  return clampView({ x: startMiddle.x - middle.x * width, y: startMiddle.y - middle.y * height, width, height }, limits);
}

/**
 * How many screen pixels one map unit is, at this view on a screen area of the given width.
 * @param {View} view
 * @param {number} screenWidth
 * @returns {number}
 */
export const pixelsPerUnit = (view, screenWidth) => screenWidth / view.width;

/**
 * The radius, in map units, of the invisible tap circle for a country: whatever it takes to be at least
 * MIN_HIT_RADIUS_PX on screen, or the country's own size if that is bigger.
 * @param {number} countryRadius In map units.
 * @param {number} scale Pixels per map unit.
 * @returns {number}
 */
export const hitRadius = (countryRadius, scale) => Math.max(countryRadius, MIN_HIT_RADIUS_PX / scale);

/**
 * Share of a tiny country's tap circle that still counts when the tap lands on another country's own drawn shape.
 * A tap on open sea can only mean a tiny country nearby, but a tap on a big neighbour's shape is probably meant for it:
 * without this, tapping the west edge of Ukraine would answer "Slovakia".
 */
export const ON_NEIGHBOUR_SHARE = 0.5;

/**
 * Which country a tap means. Every country too small to hit comfortably has an invisible tap circle (at least
 * MIN_HIT_RADIUS_PX), and the nearest such circle that contains the point wins. Where the tap lands on a different
 * country's own shape, the circle is only ON_NEIGHBOUR_SHARE as big. A tap in no circle counts for the shape under it.
 *
 * @param {{ x: number, y: number }} point In map units.
 * @param {string|null} shapeCode The country whose drawn shape is under the finger, if any.
 * @param {readonly { code: string, cx: number, cy: number, r: number }[]} anchors Every country with where to aim and its size.
 * @param {number} scale Pixels per map unit.
 * @returns {string|null}
 */
export function resolveTap(point, shapeCode, anchors, scale) {
  let best = null;
  let bestDistance = Infinity;
  for (const a of anchors) {
    // A country already big on screen has no extra circle: its own shape is its target.
    if (a.r * scale >= MIN_HIT_RADIUS_PX) continue;
    const onNeighbour = shapeCode !== null && shapeCode !== a.code;
    const radius = hitRadius(a.r, scale) * (onNeighbour ? ON_NEIGHBOUR_SHARE : 1);
    const distance = Math.hypot(point.x - a.cx, point.y - a.cy);
    if (distance <= radius && distance < bestDistance) {
      best = a.code;
      bestDistance = distance;
    }
  }
  return best ?? shapeCode;
}
