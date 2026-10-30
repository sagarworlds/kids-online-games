import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRAG_THRESHOLD, exceedsThreshold, zoneAtPoint } from '../../src/engine/utils/dragMath.js';

const box = (left, top, right, bottom, id) => ({ left, top, right, bottom, id });

test('a small wobble is a tap, a real movement is a drag', () => {
  assert.equal(exceedsThreshold({ x: 10, y: 10 }, { x: 12, y: 11 }), false);
  assert.equal(exceedsThreshold({ x: 10, y: 10 }, { x: 10 + DRAG_THRESHOLD, y: 10 }), true, 'exactly the threshold counts');
  assert.equal(exceedsThreshold({ x: 0, y: 0 }, { x: 6, y: 6 }), true, 'diagonal distance is used (8.5px)');
  assert.equal(exceedsThreshold({ x: 0, y: 0 }, { x: 3, y: 0 }, 2), true, 'a custom threshold');
});

test('zoneAtPoint finds the zone containing the point, or null', () => {
  const zones = [box(0, 0, 100, 100, 'a'), box(200, 0, 300, 100, 'b')];
  assert.equal(zoneAtPoint(zones, 50, 50).id, 'a');
  assert.equal(zoneAtPoint(zones, 250, 10).id, 'b');
  assert.equal(zoneAtPoint(zones, 150, 50), null, 'between the zones');
  assert.equal(zoneAtPoint([], 1, 1), null);
});

test('points on an edge or corner are inside', () => {
  const zones = [box(0, 0, 100, 100, 'a')];
  for (const [x, y] of [[0, 0], [100, 100], [0, 100], [100, 0], [50, 0]]) assert.equal(zoneAtPoint(zones, x, y)?.id, 'a', `${x},${y}`);
  assert.equal(zoneAtPoint(zones, 100.01, 50), null);
});

test('when zones overlap the innermost (smallest) one wins, whatever the order', () => {
  const big = box(0, 0, 300, 300, 'tray');
  const small = box(100, 100, 150, 150, 'slot');
  assert.equal(zoneAtPoint([big, small], 120, 120).id, 'slot');
  assert.equal(zoneAtPoint([small, big], 120, 120).id, 'slot');
  assert.equal(zoneAtPoint([big, small], 10, 10).id, 'tray', 'outside the small one it is the big one');
});
