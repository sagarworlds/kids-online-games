import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { PICTURE_FLOW } from '../../src/games/spot-the-difference/logic/pictureFlow.machine.js';

const at = (...events) => {
  const flow = createMachine(PICTURE_FLOW);
  for (const event of events) flow.must(event);
  return flow;
};

test('a picture starts in "playing"', () => {
  assert.equal(createMachine(PICTURE_FLOW).state, 'playing');
});

test('finding the last difference locks the picture, and it can only happen once', () => {
  const flow = at();
  assert.equal(flow.send('FOUND_ALL'), true);
  assert.equal(flow.state, 'done');
  assert.equal(flow.send('FOUND_ALL'), false, 'a second completion is ignored');
});

test('Next cannot move on from a picture that is still being played', () => {
  assert.equal(at().send('NEXT_PICTURE'), false);
  assert.equal(at().send('LEAVE'), false);
});

test('Next starts the following picture from the beginning', () => {
  const flow = at('FOUND_ALL', 'NEXT_PICTURE');
  assert.equal(flow.state, 'playing');
});

test('after the last Next nothing more is accepted, so a second press cannot ask for the results twice', () => {
  const flow = at('FOUND_ALL', 'LEAVE');
  for (const event of ['NEXT_PICTURE', 'LEAVE', 'FOUND_ALL']) assert.equal(flow.send(event), false, event);
});
