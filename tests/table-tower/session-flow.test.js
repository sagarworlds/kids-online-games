import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { QUIZ_SESSION_MACHINE } from '../../src/games/table-tower/logic/quizSession.machine.js';

const at = (...events) => {
  const run = createMachine(QUIZ_SESSION_MACHINE);
  for (const event of events) run.must(event);
  return run;
};

test('a run starts with a question waiting', () => {
  assert.equal(createMachine(QUIZ_SESSION_MACHINE).state, 'asking');
});

test('a question is answered once, and cannot be moved past while it is still waiting', () => {
  assert.equal(at().send('NEXT'), false);
  assert.equal(at().send('FINISH'), false);
  assert.equal(at('ANSWER').send('ANSWER'), false);
});

test('moving on from an answered question opens the next one or finishes the run', () => {
  assert.equal(at('ANSWER', 'NEXT').state, 'asking');
  assert.equal(at('ANSWER', 'FINISH').state, 'finished');
});

test('the clock can end the run whether a question is waiting or its answer is on show', () => {
  assert.equal(at().send('TIME_UP'), true);
  assert.equal(at('ANSWER').send('TIME_UP'), true);
  assert.equal(at().state, 'asking');
  assert.equal(at('ANSWER', 'TIME_UP').state, 'timedOut');
});

test('"over" is a tag on both ways to end, and nothing more is accepted afterwards', () => {
  for (const run of [at('ANSWER', 'FINISH'), at('TIME_UP')]) {
    assert.equal(run.hasTag('over'), true);
    for (const event of ['ANSWER', 'NEXT', 'FINISH', 'TIME_UP']) assert.equal(run.send(event), false, event);
  }
  assert.equal(at().hasTag('over'), false);
  assert.equal(at('ANSWER').hasTag('over'), false);
});
