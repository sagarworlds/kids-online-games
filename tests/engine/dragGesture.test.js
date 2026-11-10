import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { DRAG_GESTURE_MACHINE } from '../../src/engine/ui/dragGesture.machine.js';

const at = (...events) => {
  const gesture = createMachine(DRAG_GESTURE_MACHINE);
  for (const event of events) gesture.must(event);
  return gesture;
};

test('with nothing pressed, only a press does anything', () => {
  const gesture = at();
  assert.equal(gesture.state, 'idle');
  for (const event of ['DRAG_START', 'POINTER_UP', 'CANCEL']) assert.equal(gesture.send(event), false, event);
  assert.equal(gesture.send('POINTER_DOWN'), true);
});

test('a second pointer going down is ignored, whether the first is pressed or already dragging', () => {
  assert.equal(at('POINTER_DOWN').send('POINTER_DOWN'), false);
  assert.equal(at('POINTER_DOWN', 'DRAG_START').send('POINTER_DOWN'), false);
  assert.equal(at('POINTER_DOWN', 'DRAG_START').state, 'dragging', 'and the drag carries on');
});

test('a press becomes a drag once, and not from rest', () => {
  assert.equal(at('POINTER_DOWN').send('DRAG_START'), true);
  assert.equal(at('POINTER_DOWN', 'DRAG_START').send('DRAG_START'), false);
  assert.equal(at().send('DRAG_START'), false);
});

test('lifting or cancelling frees the gesture from either phase, ready for the next press', () => {
  for (const end of ['POINTER_UP', 'CANCEL']) {
    for (const start of [['POINTER_DOWN'], ['POINTER_DOWN', 'DRAG_START']]) {
      const gesture = at(...start, end);
      assert.equal(gesture.state, 'idle', `${start.join(' > ')} then ${end}`);
      assert.equal(gesture.send('POINTER_DOWN'), true, 'reusable');
    }
  }
});
