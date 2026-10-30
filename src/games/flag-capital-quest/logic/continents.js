import { WORLD_WIDTH, WORLD_HEIGHT, rectFor } from './projection.js';

/**
 * @typedef {'Africa'|'Asia'|'Europe'|'North America'|'South America'|'Oceania'} Continent
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/**
 * The six continents of the quiz, with the box of longitude and latitude the zoomed map shows for each. Oceania's box
 * stops at the 180th meridian, so the few islands on the other side of the edge of the map (Samoa, Tonga, most of
 * Kiribati) are not in view there.
 * @type {readonly { id: Continent, west: number, east: number, south: number, north: number }[]}
 */
export const CONTINENTS = Object.freeze([
  { id: 'Africa', west: -26, east: 60, south: -36, north: 38 },
  { id: 'Asia', west: 24, east: 150, south: -12, north: 56 },
  { id: 'Europe', west: -26, east: 62, south: 34, north: 72 },
  { id: 'North America', west: -170, east: -50, south: 5, north: 75 },
  { id: 'South America', west: -82, east: -34, south: -56, north: 14 },
  { id: 'Oceania', west: 105, east: 180, south: -48, north: 12 },
].map(Object.freeze));

export const CONTINENT_IDS = Object.freeze(CONTINENTS.map((c) => c.id));

/** The whole map. @type {Rect} */
export const WORLD_VIEW = Object.freeze({ x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT });

/** @param {Continent} id @returns {Rect} The part of the map to show for a continent. */
export function viewFor(id) {
  const continent = CONTINENTS.find((c) => c.id === id);
  return continent ? rectFor(continent) : { ...WORLD_VIEW };
}

/**
 * Is any of a country's main landmass inside a view? Uses the box round its biggest piece of land, so a country that
 * reaches into the view (Russia in the Europe view) counts, while one whose land is elsewhere (Kiribati's biggest island
 * is far from the Oceania view) does not.
 *
 * @param {Rect} view
 * @param {{ cx: number, cy: number, r: number }} anchor
 * @returns {boolean}
 */
export function reachesView(view, { cx, cy, r }) {
  return cx + r >= view.x && cx - r <= view.x + view.width && cy + r >= view.y && cy - r <= view.y + view.height;
}
