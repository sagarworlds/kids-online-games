/**
 * The map projection: plain equirectangular (longitude and latitude straight onto x and y), because it is the easiest to
 * reason about and to test. The world is 1000 units wide, and the picture is cropped to the latitudes where countries
 * are (no Antarctica). Both the script that draws `assets/world.svg` and the screen that zooms into a continent use these
 * numbers, so a place is always in the same spot on both.
 */

export const WORLD_WIDTH = 1000;
/** Units per degree. */
export const SCALE = WORLD_WIDTH / 360;
export const MAX_LATITUDE = 84;
export const MIN_LATITUDE = -58;
export const WORLD_HEIGHT = Math.round((MAX_LATITUDE - MIN_LATITUDE) * SCALE);

/**
 * @param {number} lon Degrees east (-180 to 180).
 * @param {number} lat Degrees north.
 * @returns {[number, number]} x and y on the map.
 */
export const project = (lon, lat) => [(lon + 180) * SCALE, (MAX_LATITUDE - lat) * SCALE];

/**
 * The map rectangle for a box of longitudes and latitudes.
 * @param {{ west: number, east: number, south: number, north: number }} box
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function rectFor({ west, east, south, north }) {
  const [x, y] = project(west, north);
  const [x2, y2] = project(east, south);
  return { x, y, width: x2 - x, height: y2 - y };
}
