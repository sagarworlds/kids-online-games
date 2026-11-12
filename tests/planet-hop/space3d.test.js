// The pure maths behind Planet Hop's 3D view: where things go, how the rocket and camera move, and the gravity jump.
// None of it imports three.js, so it runs without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameError } from '../../src/engine/utils/errors.js';
import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { validatePlanets, weighStops } from '../../src/games/planet-hop/logic/planets.js';
import { createSizer, MAX_DIAMETER, MIN_DIAMETER } from '../../src/games/planet-hop/logic/scale.js';
import { lineupLabel } from '../../src/games/planet-hop/logic/lineup.js';
import {
  orbitRadius, orbitPoint, moonPoint, bodyRadius, outerRadius, overviewDistance, figureScale, focusFraming,
  FIRST_ORBIT, ORBIT_GAP, MAX_BODY_RADIUS, SUN_RADIUS, FIGURE_HEIGHT,
} from '../../src/games/planet-hop/logic/space3d.js';
import { distanceBetween } from '../../src/engine/three/motionMath.js';
import { hopArc, flightSeconds, arcLift } from '../../src/games/planet-hop/logic/motion3d.js';
import {
  jumpRatio, jumpSeconds, jumpsFor, jumpTotalSeconds, jumpHeight, jumpOffset, jumpNote, EARTH_JUMP_SECONDS,
} from '../../src/games/planet-hop/logic/gravityJump.js';
import { ROCKET_TRIP_MACHINE } from '../../src/games/planet-hop/logic/rocketTrip.machine.js';

const GAME = new URL('../../src/games/planet-hop/', import.meta.url);
const data = validatePlanets(JSON.parse(readFileSync(new URL('data/planets.json', GAME), 'utf8')));
const { planets, bonus } = data;
const stops = weighStops(data);
const gravityOf = Object.fromEntries(stops.map((b) => [b.id, b.gravity]));
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

// ---- layout -----------------------------------------------------------------------------------------

test('orbits are evenly spaced, start clear of the Sun, and refuse a number that is not a planet place', () => {
  assert.equal(orbitRadius(1), FIRST_ORBIT);
  near(orbitRadius(5) - orbitRadius(4), ORBIT_GAP);
  assert.ok(orbitRadius(1) > SUN_RADIUS + MAX_BODY_RADIUS, 'even the biggest planet in orbit 1 would clear the Sun');
  for (const bad of [0, -1, 1.5, NaN, '3']) throwsCode(() => orbitRadius(bad), 'BAD_ORDER');
  assert.equal(outerRadius(8), orbitRadius(8));
  assert.equal(outerRadius(0), orbitRadius(1), 'no planets still gives a sensible size');
});

test('each planet sits on its own orbit in the flat plane, and no two neighbours line up', () => {
  for (let order = 1; order <= 8; order++) {
    const p = orbitPoint(order);
    assert.equal(p.y, 0);
    near(Math.hypot(p.x, p.z), orbitRadius(order), 1e-9);
  }
  // "Never line up" matters because the rocket flies in straight lines between planets: two on one ray would make the
  // flight pass through the planet in front.
  for (let order = 1; order < 8; order++) {
    const a = orbitPoint(order);
    const b = orbitPoint(order + 1);
    const cos = (a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z));
    assert.ok(cos < 0.2, `orbits ${order} and ${order + 1} are only ${Math.round((Math.acos(cos) * 180) / Math.PI)} degrees apart`);
  }
});

test('the Moon sits beside Earth with clear space between them, along Earth\'s orbit rather than on the line to the Sun', () => {
  const earth = orbitPoint(3);
  const moon = moonPoint(earth, 0.6, 0.45);
  assert.ok(distanceBetween(earth, moon) > 0.6 + 0.45, 'the two spheres do not overlap');
  const toMoon = { x: moon.x - earth.x, z: moon.z - earth.z };
  near(toMoon.x * earth.x + toMoon.z * earth.z, 0, 1e-9); // at right angles to the line from the Sun
  assert.equal(moon.y, earth.y);
  assert.deepEqual(moonPoint({ x: 0, y: 0, z: 0 }, 1, 1).y, 0, 'a parent at the origin does not divide by zero');
});

test('picture sizes from the 2D game become sphere radii, with Jupiter the biggest and the same proportions in real size', () => {
  const sizeOf = (real) => createSizer([...planets, ...bonus], { real });
  const compressed = sizeOf(false);
  const real = sizeOf(true);
  const jupiter = planets.find((p) => p.id === 'jupiter');
  const mercury = planets.find((p) => p.id === 'mercury');
  const moon = bonus[0];
  near(bodyRadius(MAX_DIAMETER), MAX_BODY_RADIUS);
  near(bodyRadius(compressed(jupiter)), MAX_BODY_RADIUS);
  near(bodyRadius(compressed(moon)), (MIN_DIAMETER / MAX_DIAMETER) * MAX_BODY_RADIUS);
  // Jupiter really is about 29 times as wide as Mercury; the compressed view shows only about 3 times.
  near(bodyRadius(real(jupiter)) / bodyRadius(real(mercury)), jupiter.radiusKm / mercury.radiusKm, 1e-6);
  assert.ok(bodyRadius(compressed(jupiter)) / bodyRadius(compressed(mercury)) < 4);
});

test('the overview shows every orbit on a tall phone and on a wide monitor, and survives nonsense', () => {
  const outer = outerRadius(8);
  const halfWidthAt = (distance, aspect) => distance * Math.tan((50 * Math.PI) / 360) * Math.min(aspect, 1.3);
  for (const aspect of [0.46, 0.8, 1, 1.78, 2.4]) {
    assert.ok(halfWidthAt(overviewDistance({ aspect, outer }), aspect) >= outer, `aspect ${aspect}`);
  }
  assert.ok(overviewDistance({ aspect: 0.5, outer }) > overviewDistance({ aspect: 1, outer }), 'a narrower view must stand farther back');
  assert.equal(overviewDistance({ aspect: 3, outer }), overviewDistance({ aspect: 1.3, outer }), 'wide screens are capped');
  assert.equal(overviewDistance({ aspect: NaN, outer }), overviewDistance({ aspect: 1, outer }));
  assert.equal(overviewDistance({ aspect: 0, outer }), overviewDistance({ aspect: 1, outer }));
});

test('the figures shrink with a tiny body but stay visible', () => {
  assert.equal(figureScale(2), 1);
  assert.equal(figureScale(0.045), 0.1);
  near(figureScale(0.45), 0.5);
  assert.ok(figureScale(0.2) < figureScale(0.4));
});

test('the camera stands far enough back, and aims high enough, that the whole jump is in the picture', () => {
  const halfHeight = Math.tan((50 * Math.PI) / 360);
  for (const body of stops) {
    for (const radius of [0.045, 0.1, bodyRadius(24), bodyRadius(48), 1.35]) {
      const { distance, lift } = focusFraming({ radius, gravity: body.gravity });
      const figure = FIGURE_HEIGHT * figureScale(radius);
      const top = radius + jumpHeight(body.gravity, figure) + figure; // the highest point the astronaut's head reaches
      // The picture shows `distance * halfHeight` above and below where the camera aims (at least, when looking level).
      const shown = distance * halfHeight;
      assert.ok(lift + shown >= top, `${body.id} at radius ${radius}: the head at ${top} is above the picture's top ${lift + shown}`);
      assert.ok(distance >= 0.8 && distance >= radius * 4.5);
      assert.ok(lift >= radius * 0.5);
    }
  }
  // The Moon's jump is the tallest, so it needs the camera aimed higher than Jupiter's does on a body of the same size.
  const moon = focusFraming({ radius: 0.45, gravity: 0.17 });
  const jupiter = focusFraming({ radius: 0.45, gravity: 2.53 });
  assert.ok(moon.lift > jupiter.lift);
  assert.ok(moon.distance > jupiter.distance);
  throwsCode(() => focusFraming({ radius: 1, gravity: 0 }), 'BAD_GRAVITY');
});

// ---- movement ---------------------------------------------------------------------------------------

test('the rocket\'s flight starts and ends exactly on the two bodies and rises in the middle', () => {
  const from = { x: 0, y: 1, z: 0 };
  const to = { x: 10, y: 1, z: 0 };
  const lift = arcLift(from, to);
  assert.deepEqual(hopArc(from, to, 0, lift), from);
  assert.deepEqual(hopArc(from, to, 1, lift), to);
  const middle = hopArc(from, to, 0.5, lift);
  near(middle.x, 5);
  near(middle.y, 1 + lift);
  assert.deepEqual(hopArc(from, to, -1, lift), from);
  assert.deepEqual(hopArc(from, to, 5, lift), to);
});

test('a farther hop takes longer and rises higher, within limits a child can wait for', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const near1 = { x: 1, y: 0, z: 0 };
  const far = { x: 25, y: 0, z: 0 };
  assert.ok(flightSeconds(origin, far) > flightSeconds(origin, near1));
  assert.ok(flightSeconds(origin, near1) >= 0.7);
  assert.equal(flightSeconds(origin, { x: 900, y: 0, z: 0 }), 2);
  assert.ok(arcLift(origin, far) > arcLift(origin, near1));
  assert.ok(arcLift(origin, near1) >= 1.2);
});

// ---- the gravity jump -------------------------------------------------------------------------------

test('the same push gives a jump 1 / gravity as high: the Moon about 6 times, Jupiter well under half', () => {
  near(jumpRatio(1), 1);
  assert.equal(jumpRatio(gravityOf.moon).toFixed(1), '5.9');
  assert.equal(jumpRatio(gravityOf.mars).toFixed(1), '2.6');
  assert.ok(jumpRatio(gravityOf.jupiter) < 0.4);
  const order = ['moon', 'mercury', 'uranus', 'venus', 'earth', 'saturn', 'neptune', 'jupiter'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(jumpHeight(gravityOf[order[i - 1]], 1) >= jumpHeight(gravityOf[order[i]], 1), `${order[i - 1]} should jump at least as high as ${order[i]}`);
  }
});

test('a jump lasts 1 / gravity as long, which is what makes the Moon float', () => {
  near(jumpSeconds(1), EARTH_JUMP_SECONDS);
  near(jumpSeconds(gravityOf.moon) / jumpSeconds(1), 1 / gravityOf.moon);
  // Physics check: the same push means height = g x time^2 / 8 on every body.
  for (const g of Object.values(gravityOf)) near(jumpHeight(g, 1), (g * jumpSeconds(g) ** 2) / EARTH_JUMP_SECONDS ** 2 * jumpHeight(1, 1), 1e-9);
});

test('short jumps are done twice and the slow Moon jump once, so nobody waits long', () => {
  assert.equal(jumpsFor(1), 2);
  assert.equal(jumpsFor(gravityOf.jupiter), 2);
  assert.equal(jumpsFor(gravityOf.mars), 2);
  assert.equal(jumpsFor(gravityOf.moon), 1);
  for (const g of Object.values(gravityOf)) assert.ok(jumpTotalSeconds(g) <= 6, `${g}: ${jumpTotalSeconds(g)} s`);
});

test('the astronaut is on the ground before and after the jumps, peaks at the middle of each, and never goes below it', () => {
  const g = 1;
  const total = jumpTotalSeconds(g);
  const height = jumpHeight(g, 0.7);
  assert.equal(jumpOffset(g, 0.7, 0), 0);
  assert.equal(jumpOffset(g, 0.7, -1), 0);
  assert.equal(jumpOffset(g, 0.7, total), 0);
  assert.equal(jumpOffset(g, 0.7, total + 5), 0);
  near(jumpOffset(g, 0.7, jumpSeconds(g) / 2), height);
  near(jumpOffset(g, 0.7, jumpSeconds(g) * 1.5), height, 1e-9); // the second jump is as high as the first
  for (let t = 0; t < total; t += 0.013) assert.ok(jumpOffset(g, 0.7, t) >= 0);
  assert.ok(jumpOffset(gravityOf.moon, 0.7, jumpSeconds(gravityOf.moon) / 2) > jumpOffset(g, 0.7, jumpSeconds(g) / 2) * 5);
});

test('a gravity that is not a positive number is refused everywhere, not turned into a wild jump', () => {
  for (const bad of [0, -1, NaN, Infinity, '1', null, undefined]) {
    throwsCode(() => jumpRatio(bad), 'BAD_GRAVITY');
    throwsCode(() => jumpSeconds(bad), 'BAD_GRAVITY');
    throwsCode(() => jumpsFor(bad), 'BAD_GRAVITY');
    throwsCode(() => jumpHeight(bad, 1), 'BAD_GRAVITY');
    throwsCode(() => jumpOffset(bad, 1, 0.1), 'BAD_GRAVITY');
    throwsCode(() => jumpNote({ name: 'X', gravity: bad }), 'BAD_GRAVITY');
  }
});

test('the jump sentence names the place and says in plain numbers how much higher or lower the jump goes', () => {
  const note = (id) => jumpNote(stops.find((b) => b.id === id));
  assert.equal(note('moon'), 'On Moon the same push lifts you 5.9 times as high as on Earth.');
  assert.equal(note('mars'), 'On Mars the same push lifts you 2.6 times as high as on Earth.');
  assert.equal(note('jupiter'), 'On Jupiter the same push lifts you only 40% as high as on Earth.');
  assert.equal(note('earth'), 'On Earth the jump is the one you know from home.');
  assert.equal(note('venus'), 'On Venus the same push lifts you 1.1 times as high as on Earth.');
  assert.equal(note('saturn'), 'On Saturn the same push lifts you only 93% as high as on Earth.');
  // Every stop has a sentence, and none of them promise "100%" or "1.0 times" (which would read as no change).
  for (const body of stops) assert.doesNotMatch(note(body.id), /100%|1\.0 times/);
  assert.match(jumpNote({ name: 'Nowhere', gravity: 0.99 }), /a little higher/);
  assert.match(jumpNote({ name: 'Nowhere', gravity: 1.01 }), /only 99% as high/);
});

// ---- the rocket's machine ---------------------------------------------------------------------------

test('the rocket rests, flies, then jumps; a new hop is always accepted and the astronaut is only inside while flying', () => {
  const trip = createMachine(ROCKET_TRIP_MACHINE);
  assert.equal(trip.state, 'resting');
  assert.equal(trip.hasTag('inside'), false);
  assert.equal(trip.send('HOP'), true);
  assert.equal(trip.state, 'flying');
  assert.equal(trip.hasTag('inside'), true);
  assert.equal(trip.send('HOP'), true, 'a second hop redirects the flight');
  assert.equal(trip.state, 'flying');
  assert.equal(trip.send('JUMP'), false, 'no jumping from inside the rocket');
  assert.equal(trip.send('SETTLE'), false);
  trip.must('LAND');
  assert.equal(trip.state, 'jumping');
  assert.equal(trip.hasTag('inside'), false);
  assert.equal(trip.send('JUMP'), true, '"Jump again" restarts the jump');
  trip.must('SETTLE');
  assert.equal(trip.state, 'resting');
  assert.equal(trip.send('LAND'), false, 'nothing lands when nothing flew');
  assert.equal(trip.send('JUMP'), true);
  assert.equal(trip.send('HOP'), true, 'hopping away ends the jump');
  assert.equal(trip.state, 'flying');
});

// ---- the line-up label (shared by the 2D and 3D scenes) -----------------------------------------------

test('the line-up names a planet at Easy and Medium and only describes its look at Hard', () => {
  const mars = planets.find((p) => p.id === 'mars');
  assert.equal(lineupLabel(mars, true), 'Mars');
  assert.equal(lineupLabel(mars, false), 'Planet, the red one');
});
