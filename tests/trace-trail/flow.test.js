import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { GLYPH_FLOW } from '../../src/games/trace-trail/logic/glyphFlow.machine.js';

const at = (...events) => {
  const flow = createMachine(GLYPH_FLOW);
  for (const event of events) flow.must(event);
  return flow;
};

test('a glyph starts in "starting", where nothing can be traced yet', () => {
  assert.equal(createMachine(GLYPH_FLOW).state, 'starting');
});

test('Watch needs the tracing rules, so it is refused until the demonstration or the child\'s turn has begun', () => {
  assert.equal(at().send('WATCH'), false);
  assert.equal(at('SHOW_DEMO').send('WATCH'), true, 'restart the demonstration');
  assert.equal(at('BEGIN_TURN').send('WATCH'), true, 'watch again during your turn');
});

test('the demonstration hands over to the child exactly once', () => {
  const flow = at('SHOW_DEMO');
  assert.equal(flow.send('DEMO_ENDED'), true);
  assert.equal(flow.state, 'tracing');
  assert.equal(flow.send('DEMO_ENDED'), false);
});

test('Skip (FINISH) works at any time before the glyph is finished, and only once', () => {
  for (const flow of [at(), at('SHOW_DEMO'), at('BEGIN_TURN')]) {
    assert.equal(flow.send('FINISH'), true);
    assert.equal(flow.state, 'done');
    assert.equal(flow.send('FINISH'), false, 'a second finish is ignored');
  }
});

test('Next starts the following glyph from the beginning', () => {
  const flow = at('BEGIN_TURN', 'FINISH', 'NEXT');
  assert.equal(flow.state, 'starting');
});

test('after the last Next nothing more is accepted, so a second press cannot ask for the results twice', () => {
  const flow = at('BEGIN_TURN', 'FINISH', 'LEAVE');
  for (const event of ['NEXT', 'LEAVE', 'WATCH', 'FINISH', 'SHOW_DEMO', 'BEGIN_TURN', 'DEMO_ENDED']) assert.equal(flow.send(event), false, event);
});

test('input is open only while tracing', () => {
  assert.equal(at().is('tracing'), false);
  assert.equal(at('SHOW_DEMO').is('tracing'), false);
  assert.equal(at('SHOW_DEMO', 'DEMO_ENDED').is('tracing'), true);
  assert.equal(at('BEGIN_TURN', 'FINISH').is('tracing'), false);
});
