import test from 'node:test';
import assert from 'node:assert/strict';
import { GameError } from '../../src/engine/utils/errors.js';
import { sliceAtPoint } from '../../src/games/pizza-fractions/logic/pizza.js';
import { toppingSpots } from '../../src/games/pizza-fractions/logic/toppingSpots.js';
import {
  PIZZA_RADIUS, CHEESE_RADIUS, sliceAngle, sliceTurn, spotPosition, sliceLift, flagDashAngles, startView,
} from '../../src/games/pizza-fractions/logic/look3d.js';

const COUNTS = [2, 4, 6, 8, 10, 12];
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);

/** A point on the 3D pizza (x, z), as the tap on the top-down flat pizza that would be at the same place: x to the right, z downwards, 100 px to a unit. */
const asTap = ({ x, z }, unit = 100) => ({ x: 200 + x * unit, y: 200 + z * unit, circle: { cx: 200, cy: 200, radius: PIZZA_RADIUS * unit } });

test('a slice is a whole turn shared out evenly, and a bad slice count is refused', () => {
  for (const count of COUNTS) near(sliceAngle(count) * count, Math.PI * 2);
  for (const bad of [0, 1, -3, 2.5, NaN]) throwsCode(() => sliceAngle(bad), 'BAD_SLICE_COUNT');
  throwsCode(() => sliceTurn(0, 1), 'BAD_SLICE_COUNT');
});

test('each slice is turned to the place the flat pizza and its hit test call that slice (clockwise from 12 o\'clock, seen from above)', () => {
  for (const count of COUNTS) {
    for (let index = 0; index < count; index++) {
      // The middle of the slice built pointing forwards (towards -z), turned by its own turn about the vertical axis (what three.js does for rotation.y).
      const turn = sliceTurn(index, count);
      const forward = { x: 0, z: -0.8 };
      const placed = { x: forward.x * Math.cos(turn) + forward.z * Math.sin(turn), z: -forward.x * Math.sin(turn) + forward.z * Math.cos(turn) };
      const tap = asTap(placed);
      assert.equal(sliceAtPoint(tap.x, tap.y, tap.circle, count), index, `slice ${index} of ${count}`);
    }
  }
});

test('slice 0 is just clockwise of 12 o\'clock and the next slice is further round', () => {
  const four = [0, 1, 2, 3].map((i) => sliceTurn(i, 4));
  near(four[0], -Math.PI / 4);
  for (let i = 1; i < 4; i++) near(four[i - 1] - four[i], Math.PI / 2);
});

test('every piece of topping lies inside its own slice, on the cheese, on every pizza', () => {
  for (const count of COUNTS) {
    for (let index = 0; index < count; index++) {
      const spots = toppingSpots(index, count, CHEESE_RADIUS);
      assert.ok(spots.length >= 2, 'a slice always gets some topping');
      for (const spot of spots) {
        const { x, z } = spotPosition(spot, count, CHEESE_RADIUS);
        const turn = sliceTurn(index, count);
        const placed = { x: x * Math.cos(turn) + z * Math.sin(turn), z: -x * Math.sin(turn) + z * Math.cos(turn) };
        const tap = asTap(placed);
        assert.equal(sliceAtPoint(tap.x, tap.y, tap.circle, count), index, `slice ${index} of ${count}, spot at ${spot.distance}`);
        assert.ok(Math.hypot(x, z) <= CHEESE_RADIUS, 'on the cheese, not on the crust');
        assert.ok(spot.scale >= 0.5 && spot.scale <= 1);
      }
    }
  }
});

test('a wide slice holds more pieces than a thin one, and thin slices get smaller pieces', () => {
  const pieces = (count) => toppingSpots(0, count, CHEESE_RADIUS).length;
  assert.ok(pieces(2) >= pieces(8) && pieces(8) >= pieces(12));
  assert.ok(pieces(2) > pieces(12));
  const size = (count) => Math.max(...toppingSpots(0, count, CHEESE_RADIUS).map((s) => s.scale));
  assert.ok(size(12) <= size(4));
});

test('toppingSpots does not depend on anything but its inputs (same answer every time)', () => {
  assert.deepEqual(toppingSpots(3, 8, 92), toppingSpots(3, 8, 92));
});

test('a topped slice stands higher than a bare one; a flagged slice also moves', () => {
  assert.deepEqual(sliceLift({ topped: false, flagged: false }), { rise: 0, tilt: 0 });
  const topped = sliceLift({ topped: true, flagged: false });
  assert.ok(topped.rise > 0 && topped.tilt > 0);
  const rises = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((clock) => sliceLift({ topped: true, flagged: true, clock }).rise);
  assert.ok(Math.max(...rises) - Math.min(...rises) > 0.05, 'a flagged slice bobs');
  assert.ok(rises.every((r) => r >= topped.rise - 1e-9), 'it never sinks below a plain topped slice');
  // A bare slice that is flagged (a missing topping) is still lifted so it can be seen.
  assert.ok(sliceLift({ topped: false, flagged: true, clock: 0 }).rise > 0);
});

test('with less motion a flagged slice does not bob: it stands still, at the top of its bob', () => {
  const a = sliceLift({ topped: true, flagged: true, clock: 0, still: true });
  const b = sliceLift({ topped: true, flagged: true, clock: 1.234, still: true });
  assert.deepEqual(a, b);
  assert.ok(a.rise >= Math.max(...[0, 0.2, 0.4, 0.6].map((clock) => sliceLift({ topped: true, flagged: true, clock }).rise)) - 1e-9);
});

test('the dashes round a flagged slice sit inside it, are spread evenly, and thin slices get fewer', () => {
  for (const count of COUNTS) {
    const angles = flagDashAngles(count);
    assert.ok(angles.length >= 3);
    for (const a of angles) assert.ok(Math.abs(a) < sliceAngle(count) / 2, 'inside the slice');
    near(angles[0], -angles.at(-1));
    for (let i = 2; i < angles.length; i++) near(angles[i] - angles[i - 1], angles[1] - angles[0]);
  }
  assert.ok(flagDashAngles(2).length >= flagDashAngles(12).length);
});

test('the first view looks at the pizza from the front and above, far enough back to see all of it', () => {
  const view = startView();
  assert.ok(view.polar > 0.3 && view.polar < 1.3, 'looking down, not flat on and not straight down');
  assert.ok(view.distance > PIZZA_RADIUS * 2.5, 'the whole pizza fits');
  assert.ok(view.target.y >= 0);
});
