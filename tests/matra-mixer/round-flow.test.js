import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMachine } from '../../src/engine/utils/stateMachine.js';
import { ROUND_SESSION_MACHINE } from '../../src/games/matra-mixer/logic/roundSession.machine.js';

const at = (...events) => {
  const run = createMachine(ROUND_SESSION_MACHINE);
  for (const event of events) run.must(event);
  return run;
};

test('a run starts with a round open', () => {
  assert.equal(createMachine(ROUND_SESSION_MACHINE).state, 'asking');
});

test('a round is shown once, and cannot be moved past while it is still open', () => {
  assert.equal(at().send('NEXT_ROUND'), false);
  assert.equal(at().send('FINISH'), false);
  assert.equal(at('REVEAL').send('REVEAL'), false);
});

test('moving on from a shown round either opens the next one or ends the run', () => {
  assert.equal(at('REVEAL', 'NEXT_ROUND').state, 'asking');
  assert.equal(at('REVEAL', 'FINISH').state, 'over');
});

test('once the run is over nothing more is accepted', () => {
  const run = at('REVEAL', 'FINISH');
  for (const event of ['REVEAL', 'NEXT_ROUND', 'FINISH']) assert.equal(run.send(event), false, event);
});
