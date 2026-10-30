import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyProgram, makeBlock, countBlocks, addBlock, removeBlock, moveBlock, setRepeatTimes,
  parseId, parentListId, indexInParent, getBlock, hasBlocks, MIN_REPEAT, MAX_REPEAT,
} from '../../src/games/robot-path/logic/program.js';
import { F, L, R, C, rep, prog } from './helpers.js';

const ALL = ['forward', 'left', 'right', 'repeat', 'pick', 'callF'];

test('makeBlock builds simple blocks and empty repeats', () => {
  assert.deepEqual(makeBlock('forward'), { type: 'forward' });
  assert.deepEqual(makeBlock('repeat'), { type: 'repeat', times: MIN_REPEAT, body: [] });
  assert.deepEqual(makeBlock('repeat', 5), { type: 'repeat', times: 5, body: [] });
});

test('countBlocks counts nested blocks and Function F\'s body', () => {
  assert.equal(countBlocks(emptyProgram()), 0);
  assert.equal(hasBlocks(emptyProgram()), false);
  assert.equal(countBlocks(prog([F, rep(3, [F, R]), C], [F, L])), 1 + (1 + 2) + 1 + 2);
});

test('ids parse into a section and indices, and bad ids are rejected', () => {
  assert.deepEqual(parseId('main'), { section: 'main', indices: [] });
  assert.deepEqual(parseId('f.2.0'), { section: 'f', indices: [2, 0] });
  for (const bad of ['', 'x.1', 'main.a', 'main.-1', 'main.1.']) assert.throws(() => parseId(bad), { code: 'BAD_ID' }, bad);
  assert.equal(parentListId('main.2'), 'main');
  assert.equal(parentListId('main.1.0'), 'main.1');
  assert.equal(indexInParent('main.1.3'), 3);
  assert.throws(() => parentListId('main'), { code: 'BAD_ID' });
});

test('addBlock appends by default, inserts at an index, and never mutates its input', () => {
  const start = prog([F]);
  const snapshot = JSON.stringify(start);
  const a = addBlock(start, 'main', L);
  const b = addBlock(a, 'main', R, { index: 0 });
  assert.equal(JSON.stringify(start), snapshot, 'input untouched');
  assert.deepEqual(a.main, [F, L]);
  assert.deepEqual(b.main, [R, F, L]);
});

test('blocks can be added inside a repeat, and inside nested repeats', () => {
  let p = addBlock(emptyProgram(), 'main', makeBlock('repeat', 3));
  p = addBlock(p, 'main.0', F);
  p = addBlock(p, 'main.0', makeBlock('repeat', 2));
  p = addBlock(p, 'main.0.1', L);
  assert.deepEqual(p.main, [rep(3, [F, rep(2, [L])])]);
  assert.equal(countBlocks(p), 4);
});

test('the block limit is enforced, counting a repeat\'s contents', () => {
  const full = prog([F, F, F]);
  assert.throws(() => addBlock(full, 'main', F, { maxBlocks: 3 }), { code: 'PROGRAM_FULL' });
  assert.equal(countBlocks(addBlock(full, 'main', F, { maxBlocks: 4 })), 4);
  assert.throws(() => addBlock(prog([F, F]), 'main', rep(2, [F, F]), { maxBlocks: 4 }), { code: 'PROGRAM_FULL' });
});

test('only blocks the level allows can be added', () => {
  assert.throws(() => addBlock(emptyProgram(), 'main', makeBlock('repeat'), { allowed: ['forward', 'left', 'right'] }), { code: 'BLOCK_NOT_ALLOWED' });
  assert.doesNotThrow(() => addBlock(emptyProgram(), 'main', F, { allowed: ['forward'] }));
});

test('Function F cannot call itself, directly or from inside a repeat', () => {
  assert.throws(() => addBlock(emptyProgram(), 'f', C), { code: 'NO_RECURSION' });
  assert.throws(() => addBlock(emptyProgram(), 'f', rep(2, [C])), { code: 'NO_RECURSION' });
  assert.doesNotThrow(() => addBlock(emptyProgram(), 'main', C));
  assert.doesNotThrow(() => addBlock(emptyProgram(), 'f', rep(2, [F])));
});

test('adding to something that is not a list fails clearly', () => {
  assert.throws(() => addBlock(prog([F]), 'main.0', F), { code: 'BAD_ID' });
  assert.throws(() => addBlock(prog([F]), 'main.5', F), { code: 'BAD_ID' });
});

test('removeBlock removes a block and everything inside it', () => {
  const p = prog([F, rep(2, [F, L]), R]);
  assert.deepEqual(removeBlock(p, 'main.1').main, [F, R]);
  assert.deepEqual(removeBlock(p, 'main.1.0').main, [F, rep(2, [L]), R]);
  assert.throws(() => removeBlock(p, 'main.9'), { code: 'BAD_ID' });
});

test('moveBlock reorders within a list (index is the position after removal)', () => {
  const p = prog([F, L, R]);
  assert.deepEqual(moveBlock(p, 'main.0', 'main', 2).main, [L, R, F], 'to the end');
  assert.deepEqual(moveBlock(p, 'main.2', 'main', 0).main, [R, F, L], 'to the front');
  assert.deepEqual(moveBlock(p, 'main.1', 'main', 1).main, [F, L, R], 'same place');
});

test('moveBlock moves blocks into and out of repeats, even when ids shift', () => {
  const p = prog([F, rep(2, [L]), R]);
  // Moving main.0 into the repeat that is currently main.1 (it becomes main.0 once F is removed).
  assert.deepEqual(moveBlock(p, 'main.0', 'main.1', 1).main, [rep(2, [L, F]), R]);
  // Out of the repeat to the main list.
  assert.deepEqual(moveBlock(p, 'main.1.0', 'main', 0).main, [L, F, rep(2, []), R]);
});

test('a repeat cannot be moved inside itself', () => {
  const p = prog([rep(2, [rep(2, [F])])]);
  assert.throws(() => moveBlock(p, 'main.0', 'main.0', 0), { code: 'BAD_MOVE' });
  assert.throws(() => moveBlock(p, 'main.0', 'main.0.0', 0), { code: 'BAD_MOVE' });
  assert.doesNotThrow(() => moveBlock(p, 'main.0.0', 'main', 1));
});

test('a call block cannot be dragged into Function F', () => {
  assert.throws(() => moveBlock(prog([C], []), 'main.0', 'f', 0), { code: 'NO_RECURSION' });
});

test('moveBlock clamps an out-of-range index instead of failing', () => {
  assert.deepEqual(moveBlock(prog([F, L]), 'main.0', 'main', 99).main, [L, F]);
  assert.deepEqual(moveBlock(prog([F, L]), 'main.1', 'main', -5).main, [L, F]);
});

test('setRepeatTimes accepts 2 to 9 and rejects anything else', () => {
  const p = prog([rep(2, [F])]);
  assert.equal(setRepeatTimes(p, 'main.0', MAX_REPEAT).main[0].times, 9);
  for (const bad of [1, 10, 2.5, '3', NaN]) assert.throws(() => setRepeatTimes(p, 'main.0', bad), { code: 'BAD_REPEAT' });
  assert.throws(() => setRepeatTimes(prog([F]), 'main.0', 3), { code: 'BAD_ID' });
});

test('getBlock reads without copying', () => {
  const p = prog([F, rep(2, [L])], [R]);
  assert.deepEqual(getBlock(p, 'main.1.0'), L);
  assert.deepEqual(getBlock(p, 'f.0'), R);
  assert.equal(getBlock(p, 'main.7'), undefined);
});

test('every placeable block type is covered by the "all allowed" list', () => {
  for (const type of ALL) assert.doesNotThrow(() => addBlock(emptyProgram(), 'main', makeBlock(type), { allowed: ALL }));
});
