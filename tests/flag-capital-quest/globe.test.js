// The geometry behind the 3D globe: where a place on the flat map is on the sphere, which way the camera faces it, how far
// back it stands to see a continent, and the path the plane flies. None of it imports three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameError } from '../../src/engine/utils/errors.js';
import { orbitPosition } from '../../src/engine/three/orbitMath.js';
import { starPositions } from '../../src/engine/three/starfield.js';
import { CONTINENTS, viewFor, WORLD_VIEW } from '../../src/games/flag-capital-quest/logic/continents.js';
import { project, SCALE, MAX_LATITUDE, MIN_LATITUDE, WORLD_WIDTH } from '../../src/games/flag-capital-quest/logic/projection.js';
import {
  GLOBE_RADIUS, MIN_DISTANCE, MAX_DISTANCE, POLAR_MARGIN, lonLatToPoint, mapToLonLat, anchorToPoint, texturePlacement, uvToMapPoint,
  facingFor, rectCenter, wholeGlobeDistance, homeFraming, dragSpeed, pixelsPerMapUnit, angleBetween, greatCirclePoint,
  flightSeconds, cruiseHeight, flightHeight, pointToLonLat, sceneUnitsPerPixel,
} from '../../src/games/flag-capital-quest/logic/globe.js';

const GAME = new URL('../../src/games/flag-capital-quest/', import.meta.url);
const worldSvg = readFileSync(new URL('assets/world.svg', GAME), 'utf8');
const anchors = [...worldSvg.matchAll(/<path id="([A-Z]{2})" data-cx="([\d.-]+)" data-cy="([\d.-]+)" data-r="([\d.-]+)"/g)]
  .map(([, code, cx, cy, r]) => ({ code, cx: Number(cx), cy: Number(cy), r: Number(r) }));
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const nearPoint = (p, q, tolerance = 1e-9) => { near(p.x, q.x, tolerance); near(p.y, q.y, tolerance); near(p.z, q.z, tolerance); };
const length = (v) => Math.hypot(v.x, v.y, v.z);
const unit = (v) => { const l = length(v); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

// ---- places on the sphere --------------------------------------------------------------------------

test('the key places of the globe are where three.js puts them: (0,0) towards +x, east to the right of it, the poles up and down', () => {
  nearPoint(lonLatToPoint(0, 0), { x: 1, y: 0, z: 0 });
  nearPoint(lonLatToPoint(90, 0), { x: 0, y: 0, z: -1 });
  nearPoint(lonLatToPoint(-90, 0), { x: 0, y: 0, z: 1 });
  nearPoint(lonLatToPoint(180, 0), { x: -1, y: 0, z: 0 });
  nearPoint(lonLatToPoint(-180, 0), { x: -1, y: 0, z: 0 });
  nearPoint(lonLatToPoint(37, 90), { x: 0, y: 1, z: 0 });
  nearPoint(lonLatToPoint(-122, -90), { x: 0, y: -1, z: 0 });
  // Looking at the globe from +x (so longitude 0 faces you, y up), east (longitude 90) must be on your right. Your right
  // is (view direction x up) = (-1,0,0) x (0,1,0) = (0,0,-1), and longitude 90 is at z = -1.
  assert.ok(lonLatToPoint(90, 0).z < 0);
});

test('every point is on the sphere of the radius asked for, and a bad place is refused', () => {
  for (const lon of [-180, -97.5, 0, 33, 179.9]) {
    for (const lat of [-90, -45, 0, 12.5, 90]) {
      near(length(lonLatToPoint(lon, lat)), GLOBE_RADIUS, 1e-12);
      near(length(lonLatToPoint(lon, lat, 1.2)), 1.2, 1e-12);
    }
  }
  for (const bad of [NaN, Infinity, undefined, null]) {
    throwsCode(() => lonLatToPoint(bad, 0), 'BAD_PLACE');
    throwsCode(() => lonLatToPoint(0, bad), 'BAD_PLACE');
  }
});

test('longitude and latitude go to the sphere and back, over the whole globe', () => {
  for (let lon = -179; lon <= 179; lon += 17) {
    for (let lat = -85; lat <= 85; lat += 11) {
      const back = pointToLonLat(lonLatToPoint(lon, lat));
      near(back.lon, lon, 1e-9);
      near(back.lat, lat, 1e-9);
    }
  }
});

test('the flat map and the sphere agree: project() then mapToLonLat() is the identity, and each country anchor lands on the sphere', () => {
  for (const [lon, lat] of [[-74, 40.7], [2.35, 48.85], [139.7, 35.7], [-58, -34.6], [151.2, -33.9]]) {
    const [x, y] = project(lon, lat);
    const back = mapToLonLat(x, y);
    near(back.lon, lon, 1e-9);
    near(back.lat, lat, 1e-9);
  }
  assert.ok(anchors.length >= 190, `found only ${anchors.length} country anchors in world.svg`);
  for (const anchor of anchors) {
    const { lon, lat } = mapToLonLat(anchor.cx, anchor.cy);
    assert.ok(lon >= -180 && lon <= 180 && lat >= MIN_LATITUDE - 1 && lat <= MAX_LATITUDE + 1, `${anchor.code} is off the map (${lon}, ${lat})`);
    near(length(anchorToPoint(anchor)), GLOBE_RADIUS, 1e-12);
    near(length(anchorToPoint(anchor, 0.05)), GLOBE_RADIUS + 0.05, 1e-12);
  }
  // Well-known places end up in the right hemisphere: Brazil is south-west of the origin of the picture, Japan north-east.
  const at = (code) => mapToLonLat(anchors.find((a) => a.code === code).cx, anchors.find((a) => a.code === code).cy);
  assert.ok(at('BR').lat < 0 && at('BR').lon < -30 && at('BR').lon > -70);
  assert.ok(at('JP').lat > 30 && at('JP').lon > 125);
  assert.ok(at('AU').lat < -20 && at('AU').lon > 120);
});

// ---- the picture wrapped round it ------------------------------------------------------------------

test('the map sits in the picture at its true latitudes and fills its width, with the polar strips left plain', () => {
  const { height, scale, offsetY } = texturePlacement(2048);
  assert.equal(height, 1024);
  near(scale, 2048 / WORLD_WIDTH);
  // The map's top edge is latitude 84, which on a 180 degree tall picture is 6 degrees below the top.
  near(offsetY, (6 / 180) * 1024);
  near(offsetY + (MAX_LATITUDE - MIN_LATITUDE) * SCALE * scale, ((90 - MIN_LATITUDE) / 180) * 1024, 1e-9);
  for (const width of [512, 1024, 2048]) near(texturePlacement(width).height, width / 2);
});

test('a spot of the picture maps back to the right place on the flat map, and the polar strips are marked off the map', () => {
  const middle = uvToMapPoint(0.5, (0 + 90) / 180); // longitude 0, latitude 0
  near(middle.x, 500);
  near(middle.y, MAX_LATITUDE * SCALE);
  assert.equal(middle.onMap, true);
  const topLeft = uvToMapPoint(0, (84 + 90) / 180);
  near(topLeft.x, 0, 1e-9);
  near(topLeft.y, 0, 1e-9);
  assert.equal(uvToMapPoint(0.5, 0.99).onMap, false, 'north of 84');
  assert.equal(uvToMapPoint(0.5, 0.05).onMap, false, 'south of -58');
  // The sphere and the picture agree: the point of the sphere at a place has the picture position `uvToMapPoint` finds.
  for (const [lon, lat] of [[-74, 40.7], [139.7, 35.7], [-58, -34.6]]) {
    const u = (lon + 180) / 360;
    const v = (lat + 90) / 180;
    const spot = uvToMapPoint(u, v);
    const [x, y] = project(lon, lat);
    near(spot.x, x, 1e-9);
    near(spot.y, y, 1e-9);
  }
});

// ---- the camera --------------------------------------------------------------------------------------

test('facing a place puts the camera on the line from the globe\'s middle through it, for every place', () => {
  for (let lon = -180; lon <= 180; lon += 23) {
    for (let lat = -80; lat <= 80; lat += 13) {
      const { azimuth, polar } = facingFor(lon, lat);
      const eye = unit(orbitPosition({ azimuth, polar, distance: 3 }));
      nearPoint(eye, lonLatToPoint(lon, lat), 1e-9);
    }
  }
});

test('near a pole the camera stays off straight up and down, so the view never flips', () => {
  for (const lat of [90, 89, -89, -90]) {
    const { polar } = facingFor(10, lat);
    assert.ok(polar >= POLAR_MARGIN - 1e-12 && polar <= Math.PI - POLAR_MARGIN + 1e-12);
  }
});

test('the middle of a rectangle of the map is the place the camera looks at', () => {
  const africa = rectCenter(viewFor('Africa'));
  near(africa.lon, 17, 1e-9);
  near(africa.lat, 1, 1e-9);
  const world = rectCenter(WORLD_VIEW);
  near(world.lon, 0, 1e-9);
  // The map's height is rounded to a whole number of units, so its middle is a little off the exact middle latitude.
  near(world.lat, (MAX_LATITUDE + MIN_LATITUDE) / 2, 0.2);
});

test('the camera stands back far enough for a whole continent, never inside the sphere and never farther than the whole globe needs', () => {
  for (const aspect of [0.5, 0.8, 1, 1.6, 2.4]) {
    const worldDistance = wholeGlobeDistance(aspect);
    assert.ok(worldDistance >= MIN_DISTANCE && worldDistance <= MAX_DISTANCE);
    for (const continent of CONTINENTS) {
      const frame = homeFraming({ rect: viewFor(continent.id), aspect });
      assert.ok(frame.distance >= MIN_DISTANCE && frame.distance <= worldDistance + 1e-9, `${continent.id} at ${aspect}: ${frame.distance}`);
      // The camera is looking at the middle of the continent's box...
      const middle = rectCenter(viewFor(continent.id));
      nearPoint(unit(orbitPosition({ ...frame, distance: 1 })), lonLatToPoint(middle.lon, middle.lat), 1e-9);
      // ...and every corner of the box is on the near side of the globe, where it can be seen (a box wider than the globe
      // shows, such as Asia seen from the whole-globe distance, can only have its corners at the edge).
      for (const [lon, lat] of [[continent.west, continent.south], [continent.east, continent.south], [continent.west, continent.north], [continent.east, continent.north]]) {
        const eye = orbitPosition(frame);
        const corner = lonLatToPoint(lon, lat);
        const facing = (corner.x * eye.x + corner.y * eye.y + corner.z * eye.z) / (length(eye));
        assert.ok(facing > 1 / frame.distance - 0.02 || frame.distance >= worldDistance - 1e-9, `${continent.id} at ${aspect}: the corner (${lon}, ${lat}) is round the back (${facing.toFixed(2)} vs ${(1 / frame.distance).toFixed(2)})`);
      }
    }
  }
  // A small box needs the camera nearer than a big one, and the whole world needs the whole globe in view.
  const europe = homeFraming({ rect: viewFor('Europe'), aspect: 1 });
  const asia = homeFraming({ rect: viewFor('Asia'), aspect: 1 });
  assert.ok(europe.distance < wholeGlobeDistance(1));
  assert.ok(asia.distance >= europe.distance);
  assert.equal(homeFraming({ rect: WORLD_VIEW, aspect: 1 }).distance, wholeGlobeDistance(1));
  // A narrow phone has to stand back farther than a wide screen to see the same box.
  assert.ok(homeFraming({ rect: viewFor('Europe'), aspect: 0.5 }).distance >= homeFraming({ rect: viewFor('Europe'), aspect: 1.6 }).distance);
  // Nonsense shapes do not break it.
  assert.ok(Number.isFinite(homeFraming({ rect: viewFor('Africa'), aspect: NaN }).distance));
  assert.ok(Number.isFinite(wholeGlobeDistance(0)));
});

test('a drag turns a close-up slowly and the whole globe quickly, so the surface follows the finger', () => {
  assert.ok(dragSpeed(1.5) < dragSpeed(3));
  assert.ok(dragSpeed(3) < dragSpeed(6));
  // Standing d from the middle, the surface is d - 1 away. A drag as tall as the view moves the point under the finger by
  // the view's height there, which is 2 (d - 1) tan(fov / 2) of the sphere's radius.
  near(dragSpeed(3, 45), 2 * Math.tan(Math.PI / 8) * 2, 1e-12);
  assert.ok(dragSpeed(1) > 0, 'never zero, so a drag always does something');
});

test('how many pixels a map unit covers shrinks as the camera moves away, and a tiny country gets a bigger tap circle when zoomed out', () => {
  const near1 = pixelsPerMapUnit({ distance: 0.5, viewHeight: 400 });
  const far = pixelsPerMapUnit({ distance: 2, viewHeight: 400 });
  assert.ok(near1 > far);
  near(near1 / far, 4, 1e-9);
  assert.ok(pixelsPerMapUnit({ distance: 2, viewHeight: 800 }) > pixelsPerMapUnit({ distance: 2, viewHeight: 400 }));
  assert.ok(Number.isFinite(pixelsPerMapUnit({ distance: 0, viewHeight: 400 })), 'a camera on the surface does not divide by zero');
});

test('a size in pixels becomes a size in the scene that grows with the distance, so labels keep their on-screen size', () => {
  const near1 = sceneUnitsPerPixel({ distance: 0.5, viewHeight: 400 });
  const far = sceneUnitsPerPixel({ distance: 2, viewHeight: 400 });
  near(far / near1, 4, 1e-9);
  // A label 40 pixels tall, at that size, covers 40 of the view's 400 pixels: a tenth of the height the camera sees there.
  near((40 * far) / (2 * 2 * Math.tan(Math.PI / 8)), 40 / 400, 1e-12);
  assert.ok(sceneUnitsPerPixel({ distance: 2, viewHeight: 800 }) < far, 'a taller view has more pixels, so each is smaller');
  assert.ok(Number.isFinite(sceneUnitsPerPixel({ distance: 0, viewHeight: 0 })));
  // It is the inverse of pixelsPerMapUnit's scene scale.
  const perPixel = sceneUnitsPerPixel({ distance: 2.5, viewHeight: 500 });
  near(pixelsPerMapUnit({ distance: 2.5, viewHeight: 500 }), (1 / perPixel) * ((2 * Math.PI) / WORLD_WIDTH), 1e-9);
});

// ---- the plane's flight ------------------------------------------------------------------------------

test('the plane flies the shortest way over the surface: the ends are the two places, every point is on the sphere, and the middle is half way', () => {
  const paris = unit(lonLatToPoint(2.35, 48.85));
  const tokyo = unit(lonLatToPoint(139.7, 35.7));
  nearPoint(greatCirclePoint(paris, tokyo, 0), paris);
  nearPoint(greatCirclePoint(paris, tokyo, 1), tokyo);
  const total = angleBetween(paris, tokyo);
  for (let t = 0; t <= 1; t += 0.1) {
    const p = greatCirclePoint(paris, tokyo, t);
    near(length(p), 1, 1e-12);
    near(angleBetween(paris, p), total * t, 1e-6); // acos is ill-conditioned right next to 1, so the ends are only exact to a few 1e-8
  }
  // Paris to Tokyo goes over the north, not along the equator: the middle of the route is farther north than either end.
  assert.ok(pointToLonLat(greatCirclePoint(paris, tokyo, 0.5)).lat > 48.85);
  assert.deepEqual(greatCirclePoint(paris, paris, 0.4), paris, 'a flight to the same place stays there');
  assert.deepEqual(greatCirclePoint(paris, tokyo, -5), greatCirclePoint(paris, tokyo, 0));
  assert.deepEqual(greatCirclePoint(paris, tokyo, 5), greatCirclePoint(paris, tokyo, 1));
});

test('a flight to the exact opposite side still has a route, round by one side, with every point on the sphere', () => {
  const a = { x: 1, y: 0, z: 0 };
  const b = { x: -1, y: 0, z: 0 };
  nearPoint(greatCirclePoint(a, b, 0), a);
  nearPoint(greatCirclePoint(a, b, 1), b, 1e-9);
  for (let t = 0; t <= 1; t += 0.125) near(length(greatCirclePoint(a, b, t)), 1, 1e-9);
  near(angleBetween(a, greatCirclePoint(a, b, 0.5)), Math.PI / 2, 1e-6);
  const poleA = { x: 0, y: 1, z: 0 };
  const poleB = { x: 0, y: -1, z: 0 };
  for (let t = 0; t <= 1; t += 0.25) near(length(greatCirclePoint(poleA, poleB, t)), 1, 1e-9);
});

test('a farther flight takes longer and climbs higher, within limits a child can wait for; the plane is on the ground at both ends', () => {
  assert.ok(flightSeconds(0.1) < flightSeconds(2));
  assert.equal(flightSeconds(0), 0.8);
  assert.equal(flightSeconds(Math.PI), 2.4);
  assert.ok(cruiseHeight(0.1) < cruiseHeight(3));
  assert.ok(cruiseHeight(0) > 0);
  assert.equal(flightHeight(0, 0.1), 0);
  assert.equal(flightHeight(1, 0.1), 0);
  near(flightHeight(0.5, 0.1), 0.1);
  assert.equal(flightHeight(-1, 0.1), 0);
  assert.equal(flightHeight(9, 0.1), 0);
});

// ---- the starfield (shared engine code the globe's sky uses) -----------------------------------------------

test('the stars are on a shell round the scene, the same every time, and spread over the whole sky', () => {
  const stars = starPositions({ count: 400, seed: 7, minRadius: 110, spread: 25 });
  assert.equal(stars.length, 1200);
  assert.deepEqual(stars, starPositions({ count: 400, seed: 7, minRadius: 110, spread: 25 }), 'same seed, same sky');
  assert.notDeepEqual(stars, starPositions({ count: 400, seed: 8, minRadius: 110, spread: 25 }));
  let up = 0;
  for (let i = 0; i < stars.length; i += 3) {
    const radius = Math.hypot(stars[i], stars[i + 1], stars[i + 2]);
    assert.ok(radius >= 110 - 1e-9 && radius <= 135 + 1e-9, `star ${i / 3} is ${radius} away`);
    if (stars[i + 1] > 0) up += 1;
  }
  assert.ok(up > 150 && up < 250, `${up} of 400 stars are above the middle: the sky is lopsided`);
});
