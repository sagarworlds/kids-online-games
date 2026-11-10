import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  defineMachine, createMachine, lintMachine, describeMachine, toMermaid, transitionsOf,
} from '../../src/engine/utils/stateMachine.js';

const DOOR = defineMachine({
  id: 'door',
  initial: 'closed',
  states: {
    closed: { on: { OPEN: 'open', LOCK: 'locked' }, tags: ['usable'] },
    open: { on: { CLOSE: 'closed' }, tags: ['usable'] },
    locked: { on: { UNLOCK: 'closed' } },
  },
});

test('a machine starts in its initial state', () => {
  assert.equal(createMachine(DOOR).state, 'closed');
});

test('send moves when the state accepts the event, and reports it', () => {
  const door = createMachine(DOOR);
  assert.equal(door.send('OPEN'), true);
  assert.equal(door.state, 'open');
});

test('send ignores an event the current state does not accept, and the state is untouched', () => {
  const door = createMachine(DOOR);
  assert.equal(door.send('UNLOCK'), false);
  assert.equal(door.state, 'closed');
});

test('send throws for an event no state declares: a typo is never "input at the wrong time"', () => {
  const door = createMachine(DOOR);
  assert.throws(() => door.send('OPNE'), { code: 'UNKNOWN_EVENT' });
});

test('must throws ILLEGAL_TRANSITION with the machine, state and event in the context', () => {
  const door = createMachine(DOOR);
  assert.throws(() => door.must('UNLOCK'), (error) => {
    assert.equal(error.code, 'ILLEGAL_TRANSITION');
    assert.deepEqual(error.context, { machine: 'door', state: 'closed', event: 'UNLOCK' });
    return true;
  });
  door.must('OPEN');
  assert.equal(door.state, 'open');
});

test('can answers without moving', () => {
  const door = createMachine(DOOR);
  assert.equal(door.can('OPEN'), true);
  assert.equal(door.can('CLOSE'), false);
  assert.equal(door.state, 'closed');
});

test('is accepts several names and rejects names the definition does not declare', () => {
  const door = createMachine(DOOR);
  assert.equal(door.is('open', 'closed'), true);
  assert.equal(door.is('locked'), false);
  assert.throws(() => door.is('ajar'), { code: 'UNKNOWN_STATE' });
});

test('hasTag follows the current state', () => {
  const door = createMachine(DOOR);
  assert.equal(door.hasTag('usable'), true);
  door.must('LOCK');
  assert.equal(door.hasTag('usable'), false);
});

test('subscribers hear every move, in order, and can unsubscribe', () => {
  const door = createMachine(DOOR);
  const heard = [];
  const off = door.subscribe((change) => heard.push(change));
  door.send('OPEN');
  door.send('UNLOCK'); // refused: not heard
  door.send('CLOSE');
  off();
  door.send('OPEN');
  assert.deepEqual(heard, [
    { machine: 'door', from: 'closed', event: 'OPEN', to: 'open' },
    { machine: 'door', from: 'open', event: 'CLOSE', to: 'closed' },
  ]);
});

test('two machines made from one definition do not share state', () => {
  const a = createMachine(DOOR);
  const b = createMachine(DOOR);
  a.must('OPEN');
  assert.equal(b.state, 'closed');
});

test('defineMachine rejects an unknown initial state, a dangling target, bad tags and a missing id', () => {
  assert.throws(() => defineMachine({ id: 'x', initial: 'nope', states: { a: {} } }), { code: 'BAD_MACHINE' });
  assert.throws(() => defineMachine({ id: 'x', initial: 'a', states: { a: { on: { GO: 'b' } } } }), { code: 'BAD_MACHINE' });
  assert.throws(() => defineMachine({ id: 'x', initial: 'a', states: { a: { tags: 'oops' } } }), { code: 'BAD_MACHINE' });
  assert.throws(() => defineMachine({ initial: 'a', states: { a: {} } }), { code: 'BAD_MACHINE' });
  assert.throws(() => defineMachine({ id: 'x', initial: 'a', states: {} }), { code: 'BAD_MACHINE' });
});

test('a defined machine is frozen, so a game cannot rewrite the rules at run time', () => {
  assert.throws(() => { DOOR.states.closed.on.SMASH = 'open'; }, TypeError);
  assert.throws(() => { DOOR.states.locked = {}; }, TypeError);
});

test('lintMachine accepts a sound definition', () => {
  assert.deepEqual(lintMachine(DOOR), []);
});

test('lintMachine reports unreachable states, dead ends and final states with exits', () => {
  const broken = defineMachine({
    id: 'broken',
    initial: 'a',
    states: {
      a: { on: { GO: 'b' } },
      b: {}, // dead end, not final
      island: { on: { BACK: 'a' } }, // nothing leads here
      end: { on: { AGAIN: 'a' }, final: true }, // final, but not final
    },
  });
  assert.deepEqual(lintMachine(broken), [
    'broken: state "b" has no way out and is not marked final',
    'broken: state "island" can never be reached',
    'broken: state "end" can never be reached',
    'broken: final state "end" still has transitions',
  ]);
});

test('a final state with no exits is sound', () => {
  const m = defineMachine({ id: 'm', initial: 'a', states: { a: { on: { END: 'z' } }, z: { final: true } } });
  assert.deepEqual(lintMachine(m), []);
});

test('describeMachine and transitionsOf give plain data', () => {
  assert.deepEqual(transitionsOf(DOOR), [
    { from: 'closed', event: 'OPEN', to: 'open' },
    { from: 'closed', event: 'LOCK', to: 'locked' },
    { from: 'open', event: 'CLOSE', to: 'closed' },
    { from: 'locked', event: 'UNLOCK', to: 'closed' },
  ]);
  const described = describeMachine(DOOR);
  assert.equal(described.initial, 'closed');
  assert.deepEqual(described.states.map((s) => s.name), ['closed', 'open', 'locked']);
  assert.deepEqual(JSON.parse(JSON.stringify(described)), described, 'must survive JSON');
});

test('toMermaid is deterministic and marks the start and the final states', () => {
  const m = defineMachine({ id: 'm', initial: 'a', states: { a: { on: { END: 'z' } }, z: { final: true } } });
  assert.equal(toMermaid(m), 'stateDiagram-v2\n  [*] --> a\n  a --> z: END\n  z --> [*]');
});
