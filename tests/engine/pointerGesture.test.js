import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { POINTER_GESTURE_MACHINE } from '../../src/engine/services/pointerGesture.machine.js';

const at = (...events) => {
  const gesture = createMachine(POINTER_GESTURE_MACHINE);
  for (const event of events) gesture.must(event);
  return gesture;
};

test('with no pointer down, only a pointer going down does anything', () => {
  const gesture = at();
  assert.equal(gesture.state, 'idle');
  for (const event of ['DRAG_START', 'POINTER_UP', 'CANCEL']) assert.equal(gesture.send(event), false, event);
  assert.equal(gesture.send('POINTER_DOWN'), true);
});

test('a press becomes a drag only once, and a drag cannot start from rest', () => {
  assert.equal(at('POINTER_DOWN').send('DRAG_START'), true);
  assert.equal(at('POINTER_DOWN', 'DRAG_START').send('DRAG_START'), false);
  assert.equal(at().send('DRAG_START'), false);
});

test('lifting or cancelling ends the gesture from either phase', () => {
  for (const end of ['POINTER_UP', 'CANCEL']) {
    assert.equal(at('POINTER_DOWN', end).state, 'idle', `pressed then ${end}`);
    assert.equal(at('POINTER_DOWN', 'DRAG_START', end).state, 'idle', `dragging then ${end}`);
  }
});

test('a pointer going down replaces a gesture that is already running, from either phase', () => {
  assert.equal(at('POINTER_DOWN', 'POINTER_DOWN').state, 'pressed');
  assert.equal(at('POINTER_DOWN', 'DRAG_START', 'POINTER_DOWN').state, 'pressed');
});
