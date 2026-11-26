// The geometry behind Times-Table Racing's 3D track: where the cars and posts are and where the camera stands to watch from
// behind the player while keeping the ghost in view. None of it imports three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD_LENGTH, LANE_WIDTH, GHOST_LANE_X, PLAYER_LANE_X, ROAD_HALF_WIDTH, BASE_FOV, BOOST_FOV, carZ, tickZ, cameraFor, wobbleSway,
} from '../../src/games/times-table-racing/logic/track3d.js';
import { RACE_LENGTH } from '../../src/games/times-table-racing/logic/levels.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);

/** Is a point inside what a camera sees? (In front of it, and inside both the vertical and the horizontal field of view.) */
function visible(camera, aspect, point) {
  const { position, target, fov } = camera;
  const forward = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
  const length = Math.hypot(forward.x, forward.y, forward.z);
  forward.x /= length; forward.y /= length; forward.z /= length;
  // A camera with a level horizon: right = forward x up, up = right x forward.
  const right = { x: -forward.z, y: 0, z: forward.x };
  const rl = Math.hypot(right.x, right.z);
  right.x /= rl; right.z /= rl;
  const up = { x: right.y * forward.z - right.z * forward.y, y: right.z * forward.x - right.x * forward.z, z: right.x * forward.y - right.y * forward.x };
  const d = { x: point.x - position.x, y: point.y - position.y, z: point.z - position.z };
  const depth = d.x * forward.x + d.y * forward.y + d.z * forward.z;
  if (depth <= 0.1) return false;
  const sideways = d.x * right.x + d.y * right.y + d.z * right.z;
  const upwards = d.x * up.x + d.y * up.y + d.z * up.z;
  const half = Math.tan((fov * Math.PI) / 360);
  return Math.abs(upwards / depth) <= half && Math.abs(sideways / depth) <= half * aspect;
}

test('a car is at the start line at progress 0 and at the finish line at progress 1, and never beyond them', () => {
  assert.equal(carZ(0), -0);
  assert.equal(carZ(1), -ROAD_LENGTH);
  near(carZ(0.5), -ROAD_LENGTH / 2);
  assert.equal(carZ(-3), -0);
  assert.equal(carZ(9), -ROAD_LENGTH);
  assert.ok(carZ(0.6) < carZ(0.3), 'further along is further down -z');
});

test('the posts for the questions are evenly spaced between the start and the finish', () => {
  const zs = Array.from({ length: RACE_LENGTH - 1 }, (_, i) => tickZ(i + 1, RACE_LENGTH));
  for (let i = 1; i < zs.length; i++) near(zs[i - 1] - zs[i], ROAD_LENGTH / RACE_LENGTH);
  assert.ok(zs[0] < 0 && zs.at(-1) > -ROAD_LENGTH);
  assert.equal(tickZ(RACE_LENGTH, RACE_LENGTH), -ROAD_LENGTH, 'the last one is the finish line itself');
  // A car at a question's progress is exactly level with that question's post.
  for (let i = 1; i < RACE_LENGTH; i++) near(carZ(i / RACE_LENGTH), tickZ(i, RACE_LENGTH), 1e-9);
});

test('the ghost has the left lane and the player the right, side by side on one road', () => {
  assert.ok(GHOST_LANE_X < 0 && PLAYER_LANE_X > 0);
  near(PLAYER_LANE_X - GHOST_LANE_X, LANE_WIDTH);
  near(ROAD_HALF_WIDTH, LANE_WIDTH);
});

test('the camera is behind the player\'s car, above it, and looking down the road', () => {
  for (const player of [0, 0.25, 0.7, 1]) {
    const camera = cameraFor({ player, ghost: player, aspect: 1 });
    assert.ok(camera.position.z > carZ(player) + 5, 'behind the car');
    assert.ok(camera.position.y > 1.5, 'above the road');
    assert.ok(camera.target.z < carZ(player), 'looking ahead of the car');
    assert.ok(camera.target.y < camera.position.y, 'looking slightly down');
  }
});

test('the player\'s car and the ghost are both in view, for every pair of positions and every screen shape', () => {
  const car = (progress, x) => ({ x, y: 0.7, z: carZ(progress) });
  const steps = [0, 0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1];
  for (const aspect of [0.46, 0.6, 0.76, 1, 1.5, 2.2]) {
    for (const player of steps) {
      for (const ghost of steps) {
        const camera = cameraFor({ player, ghost, aspect });
        assert.ok(visible(camera, aspect, car(player, PLAYER_LANE_X)), `the player at ${player}, ghost ${ghost}, aspect ${aspect}`);
        assert.ok(visible(camera, aspect, car(ghost, GHOST_LANE_X)), `the ghost at ${ghost}, player ${player}, aspect ${aspect}`);
      }
    }
  }
});

test('both lanes fit across a narrow phone picture, not only a wide one', () => {
  for (const aspect of [0.46, 0.6, 0.76]) {
    const camera = cameraFor({ player: 0.4, ghost: 0.4, aspect });
    // The nearest car is `distance` in front of the camera; the road's edges must be inside the picture there.
    for (const x of [-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH]) {
      assert.ok(visible(camera, aspect, { x, y: 0, z: carZ(0.4) }), `the road edge at ${x} with aspect ${aspect}`);
    }
  }
  assert.ok(cameraFor({ player: 0.4, ghost: 0.4, aspect: 0.5 }).position.z > cameraFor({ player: 0.4, ghost: 0.4, aspect: 1.6 }).position.z, 'a narrower picture stands farther back');
});

test('the camera climbs and backs away as the ghost gets farther from the player, in either direction', () => {
  const together = cameraFor({ player: 0.5, ghost: 0.5 });
  const ghostAhead = cameraFor({ player: 0.2, ghost: 0.8 });
  const ghostBehind = cameraFor({ player: 0.8, ghost: 0.2 });
  assert.ok(ghostAhead.position.y > together.position.y);
  assert.ok(ghostBehind.position.y > together.position.y);
  assert.ok(ghostAhead.position.z - carZ(0.2) > together.position.z - carZ(0.5), 'farther back from the player when the ghost is ahead');
  // It is the same whichever of the two is ahead (the picture is built from how far apart they are).
  near(ghostAhead.position.y, ghostBehind.position.y);
});

test('a right answer widens the view for a moment (a rush of speed) and nothing else changes', () => {
  const calm = cameraFor({ player: 0.3, ghost: 0.5 });
  const boosted = cameraFor({ player: 0.3, ghost: 0.5, boost: 1 });
  near(calm.fov, BASE_FOV);
  near(boosted.fov, BASE_FOV + BOOST_FOV);
  assert.deepEqual(boosted.position, calm.position);
  assert.deepEqual(boosted.target, calm.target);
  near(cameraFor({ player: 0.3, ghost: 0.5, boost: 0.5 }).fov, BASE_FOV + BOOST_FOV / 2);
  assert.equal(cameraFor({ player: 0.3, ghost: 0.5, boost: 9 }).fov, BASE_FOV + BOOST_FOV, 'held at the top');
  assert.equal(cameraFor({ player: 0.3, ghost: 0.5, boost: -1 }).fov, BASE_FOV, 'and at the bottom');
});

test('nonsense for the picture shape does not break the camera', () => {
  for (const aspect of [NaN, 0, -2, Infinity, undefined]) {
    const camera = cameraFor({ player: 0.5, ghost: 0.5, aspect });
    for (const part of [camera.position, camera.target]) for (const value of Object.values(part)) assert.ok(Number.isFinite(value), `aspect ${aspect}`);
  }
});

test('a wrong answer sways the car and then settles; with less motion it does not move at all', () => {
  assert.deepEqual(wobbleSway({ time: 3, wobble: 0, reduced: false }), { x: 0, roll: 0 });
  assert.deepEqual(wobbleSway({ time: 3, wobble: 1, reduced: true }), { x: 0, roll: 0 });
  assert.deepEqual(wobbleSway({ time: 3, wobble: -1, reduced: false }), { x: 0, roll: 0 });
  let biggest = 0;
  for (let t = 0; t < 2; t += 0.01) biggest = Math.max(biggest, Math.abs(wobbleSway({ time: t, wobble: 1, reduced: false }).x));
  assert.ok(biggest > 0.1 && biggest <= 0.12 + 1e-9);
  let smaller = 0;
  for (let t = 0; t < 2; t += 0.01) smaller = Math.max(smaller, Math.abs(wobbleSway({ time: t, wobble: 0.3, reduced: false }).x));
  assert.ok(smaller < biggest, 'it dies away as the wobble fades');
});
