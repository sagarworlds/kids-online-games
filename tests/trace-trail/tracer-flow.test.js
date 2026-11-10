import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { GLYPH_TRACER_MACHINE } from '../../src/games/trace-trail/logic/glyphTracer.machine.js';

const at = (...events) => {
  const pencil = createMachine(GLYPH_TRACER_MACHINE);
  for (const event of events) pencil.must(event);
  return pencil;
};

test('the pencil starts up, with a stroke waiting', () => {
  assert.equal(createMachine(GLYPH_TRACER_MACHINE).state, 'ready');
});

test('only a pencil that is up can go down, and only one that is down can move on', () => {
  assert.equal(at().send('PEN_UP'), false);
  assert.equal(at().send('STROKE_DONE'), false);
  assert.equal(at().send('GLYPH_DONE'), false);
  assert.equal(at('PEN_DOWN').send('PEN_DOWN'), false, 'a second finger or a resting palm cannot start another stroke');
});

test('lifting the pencil, or finishing a stroke that is not the last, puts it back up for the next try', () => {
  assert.equal(at('PEN_DOWN', 'PEN_UP').state, 'ready');
  assert.equal(at('PEN_DOWN', 'STROKE_DONE').state, 'ready');
});

test('finishing the last stroke ends the glyph for good', () => {
  const pencil = at('PEN_DOWN', 'GLYPH_DONE');
  assert.equal(pencil.state, 'done');
  for (const event of ['PEN_DOWN', 'PEN_UP', 'STROKE_DONE', 'GLYPH_DONE']) assert.equal(pencil.send(event), false, event);
});
