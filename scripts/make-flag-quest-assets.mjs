// Builds the picture assets for Flag & Capital Quest: the flag files and the world map.
//
// This is run by a person when the country list changes, not by the site build, so its output is committed:
//
//   npm pack flag-icons@7.6.0 && tar xzf flag-icons-7.6.0.tgz      (MIT licence)
//   npm pack world-atlas@2.0.2 && tar xzf world-atlas-2.0.2.tgz    (ISC licence; the data is Natural Earth, public domain)
//   node scripts/make-flag-quest-assets.mjs <flag-icons package dir> <world-atlas package dir>
//
// It copies the 4:3 flag of every country in data/countries.json, and draws assets/world.svg from the 10 m map: one
// <path id="IN"> for each country, plus plain grey paths (no id) for land that is not in the quiz, so the map stays
// neutral about disputed places. Each country path also records where to aim for (data-cx, data-cy, data-r) so the game
// can draw a bigger tap target on tiny countries. Nothing here runs in the browser.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, WORLD_WIDTH, WORLD_HEIGHT, MAX_LATITUDE, MIN_LATITUDE } from '../src/games/flag-capital-quest/logic/projection.js';

const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '../src/games/flag-capital-quest');

/** Where the map data spells a country differently from our list (matched by name, since the map ids are numeric). */
const ATLAS_NAMES = {
  CV: 'Cabo Verde', CF: 'Central African Rep.', CG: 'Congo', CD: 'Dem. Rep. Congo', CI: "Côte d'Ivoire", GQ: 'Eq. Guinea',
  SZ: 'eSwatini', ST: 'São Tomé and Principe', SS: 'S. Sudan', BA: 'Bosnia and Herz.', MK: 'Macedonia', VA: 'Vatican',
  AG: 'Antigua and Barb.', DO: 'Dominican Rep.', KN: 'St. Kitts and Nevis', VC: 'St. Vin. and Gren.', US: 'United States of America',
  MH: 'Marshall Is.', SB: 'Solomon Is.',
};

/**
 * Overseas pieces that the map data files under a country but that are far from it (French Guiana belongs to "France").
 * Keeping them would draw that colour on another continent and stretch the Europe view, so only the pieces whose middle is
 * inside the box are drawn.
 */
const KEEP_ONLY = {
  France: { minLon: -12, maxLon: 20, minLat: 38, maxLat: 55 },
  Netherlands: { minLon: 0, maxLon: 10, minLat: 49, maxLat: 56 },
};

const SIMPLIFY = 0.3; // map units (the map is 1000 wide), about a fifth of a pixel at the default zoom
const MIN_RING_AREA = 0.12;
const SMALL_TOTAL = 40; // map units squared: a country with less land than this keeps all its islands
const SMALL_COUNTRY = 3; // map units: countries smaller than this are not simplified at all
const CONTEXT_MIN_AREA = 1.5;

// ---------------------------------------------------------------- TopoJSON

function decodeArcs(topology) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

function buildRing(indices, arcs) {
  const points = [];
  for (const index of indices) {
    const arc = index < 0 ? [...arcs[~index]].reverse() : arcs[index];
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
}

/** All the rings of a geometry as arrays of [lon, lat], grouped by polygon. */
function polygonsOf(geometry, arcs) {
  if (geometry.type === 'Polygon') return [geometry.arcs.map((r) => buildRing(r, arcs))];
  if (geometry.type === 'MultiPolygon') return geometry.arcs.map((poly) => poly.map((r) => buildRing(r, arcs)));
  return [];
}

// ---------------------------------------------------------------- geometry

const ringArea = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return sum + (x * y2 - x2 * y);
}, 0) / 2);
const centroid = (ring) => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];

/** Ramer–Douglas–Peucker line simplification. */
function simplify(points, tolerance) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const closed = points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
  if (closed) {
    // A ring starts and ends at the same point, so there is no line to measure against. Split it at the point
    // farthest from the start and simplify each half.
    let far = 1;
    for (let i = 2; i < points.length - 1; i++) {
      if (Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]) > Math.hypot(points[far][0] - points[0][0], points[far][1] - points[0][1])) far = i;
    }
    keep[far] = 1;
    stack.length = 0;
    stack.push([0, far], [far, points.length - 1]);
  }
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const length = Math.hypot(bx - ax, by - ay) || 1e-9;
    let far = -1;
    let farDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = Math.abs((by - ay) * points[i][0] - (bx - ax) * points[i][1] + bx * ay - by * ax) / length;
      if (d > farDistance) { far = i; farDistance = d; }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([first, far], [far, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const fmt = (n, places) => String(Number(n.toFixed(places)));

/**
 * The map data is drawn on a globe, so a shape that crosses the 180th meridian (Russia's far east, Fiji) jumps from +180
 * to -180 in the middle of a ring, which a flat map would draw as a line across the whole world. This unwraps the
 * longitudes so the ring is continuous, then cuts it at the edge of the map: whatever sticks out past +180 reappears at
 * -180, and the other way round.
 *
 * @param {[number, number][]} ring Longitude and latitude.
 * @returns {[number, number][][]} One ring, or two when the shape crosses the edge.
 */
function splitAtAntimeridian(ring) {
  const unwrapped = [];
  let previous = ring[0][0];
  for (const [lon, lat] of ring) {
    let x = lon;
    while (x - previous > 180) x -= 360;
    while (x - previous < -180) x += 360;
    unwrapped.push([x, lat]);
    previous = x;
  }
  const lons = unwrapped.map((p) => p[0]);
  if (Math.max(...lons) <= 180 && Math.min(...lons) >= -180) return [unwrapped];
  const pieces = [];
  const shifts = Math.max(...lons) > 180 ? [0, -360] : [0, 360];
  for (const shift of shifts) {
    const moved = unwrapped.map(([x, lat]) => [x + shift, lat]);
    const clipped = clip(clip(moved, 'min', -180), 'max', 180);
    if (clipped.length >= 3) pieces.push(clipped);
  }
  return pieces;
}

/** Sutherland-Hodgman clip of a polygon against one vertical line: keep x >= limit ('min') or x <= limit ('max'). */
function clip(points, side, limit) {
  const inside = ([x]) => (side === 'min' ? x >= limit : x <= limit);
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (limit - a[0]) / (b[0] - a[0]);
      out.push([limit, a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** An SVG path for the polygons of one country, or null if nothing of it is on the map. */
function pathFor(polygons, { clip, keepAll }) {
  let rings = [];
  for (const polygon of polygons) {
    const outer = polygon[0];
    const [clon, clat] = centroid(outer);
    if (clip && (clon < clip.minLon || clon > clip.maxLon || clat < clip.minLat || clat > clip.maxLat)) continue;
    if (outer.every(([, lat]) => lat < MIN_LATITUDE)) continue; // Antarctica
    polygon.forEach((ring, i) => {
      for (const piece of splitAtAntimeridian(ring)) rings.push({ ring: piece.map(([lon, lat]) => project(lon, lat)), hole: i > 0 });
    });
  }
  if (!rings.length) return null;
  const biggest = Math.max(...rings.map((r) => ringArea(r.ring)));
  const total = rings.reduce((sum, r) => sum + (r.hole ? 0 : ringArea(r.ring)), 0);
  const small = Math.sqrt(biggest) < SMALL_COUNTRY;
  // Tiny islands are dropped from big countries, but a country that is all small islands keeps every one of them.
  rings = rings.filter((r) => r.hole || ringArea(r.ring) >= MIN_RING_AREA || ringArea(r.ring) === biggest || keepAll || total < SMALL_TOTAL);
  const places = small ? 2 : 1;
  const parts = rings.map(({ ring }) => {
    const points = small ? ring : simplify(ring, SIMPLIFY);
    if (points.length < 3) return '';
    return `M${points.map(([x, y]) => `${fmt(x, places)} ${fmt(y, places)}`).join(' ')}Z`;
  }).filter(Boolean);
  if (!parts.length) return null;
  // Where to aim for: the middle of the country's biggest piece of land, and how far it reaches. (The middle of the whole
  // country can be out in the sea: Kiribati's islands are spread across the Pacific.)
  const main = rings.filter((r) => !r.hole).reduce((best, r) => (ringArea(r.ring) > ringArea(best.ring) ? r : best));
  const xs = main.ring.map((p) => p[0]);
  const ys = main.ring.map((p) => p[1]);
  const anchor = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    r: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2,
  };
  return { d: parts.join(''), area: biggest, anchor };
}

// ---------------------------------------------------------------- main

async function main() {
  const [flagsDir, atlasDir] = process.argv.slice(2);
  if (!flagsDir || !atlasDir) {
    console.error('usage: node scripts/make-flag-quest-assets.mjs <flag-icons package dir> <world-atlas package dir>');
    process.exit(2);
  }
  const countries = JSON.parse(await readFile(join(GAME, 'data/countries.json'), 'utf8')).countries;

  // ---- flags
  const flagOut = join(GAME, 'assets/flags');
  await mkdir(flagOut, { recursive: true });
  for (const c of countries) {
    const from = join(flagsDir, 'flags/4x3', `${c.code.toLowerCase()}.svg`);
    if (!existsSync(from)) throw new Error(`no flag for ${c.code} (${c.name}) in ${from}`);
    await copyFile(from, join(flagOut, `${c.code.toLowerCase()}.svg`));
  }
  await copyFile(join(flagsDir, 'LICENSE'), join(flagOut, 'LICENSE.txt'));

  // ---- map
  const topology = JSON.parse(await readFile(join(atlasDir, 'countries-10m.json'), 'utf8'));
  const arcs = decodeArcs(topology);
  const geometries = topology.objects.countries.geometries;
  const byName = new Map();
  for (const g of geometries) if (g.properties?.name) byName.set(g.properties.name, g);

  const used = new Set();
  const quiz = [];
  for (const c of countries) {
    const geometry = byName.get(ATLAS_NAMES[c.code] ?? c.name);
    if (!geometry) throw new Error(`the map has no shape for ${c.code} (${c.name})`);
    used.add(geometry);
    const shape = pathFor(polygonsOf(geometry, arcs), { clip: KEEP_ONLY[ATLAS_NAMES[c.code] ?? c.name], keepAll: false });
    if (!shape) throw new Error(`nothing of ${c.code} (${c.name}) is on the map`);
    const { cx, cy, r } = shape.anchor;
    quiz.push(`<path id="${c.svgPathId}" data-cx="${fmt(cx, 1)}" data-cy="${fmt(cy, 1)}" data-r="${fmt(r, 1)}" d="${shape.d}"/>`);
  }
  // Everything else big enough to see is drawn plain grey: no id, no name, nothing to answer.
  const context = [];
  for (const g of geometries) {
    if (used.has(g) || g.properties?.name === 'Antarctica') continue;
    const shape = pathFor(polygonsOf(g, arcs), { keepAll: false });
    if (shape && shape.area >= CONTEXT_MIN_AREA) context.push(`<path class="context" d="${shape.d}"/>`);
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}" fill-rule="evenodd">`,
    `<title>World map</title>`,
    `<g id="context">${context.join('')}</g>`,
    `<g id="countries">${quiz.join('')}</g>`,
    '</svg>',
  ].join('\n');
  await writeFile(join(GAME, 'assets/world.svg'), svg);
  console.log(`flags: ${countries.length}, map: ${quiz.length} countries + ${context.length} grey shapes, ${(svg.length / 1024).toFixed(0)} KB (lat ${MIN_LATITUDE} to ${MAX_LATITUDE})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
