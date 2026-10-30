import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, run, execute, turn, MAX_STEPS, DIRS } from '../../src/games/robot-path/logic/interpreter.js';
import { F, L, R, P, C, rep, prog, makeLevel } from './helpers.js';

const positions = (frames) => frames.map((f) => `${f.x},${f.y}${f.dir}`);

// ---- turning ---------------------------------------------------------------

test('turns are relative to the way the robot faces', () => {
  assert.deepEqual(DIRS.map((d) => turn(d, 'left')), ['W', 'N', 'E', 'S']);
  assert.deepEqual(DIRS.map((d) => turn(d, 'right')), ['E', 'S', 'W', 'N']);
  // Four right turns make a full circle; left undoes right.
  let dir = 'N';
  for (let i = 0; i < 4; i++) dir = turn(dir, 'right');
  assert.equal(dir, 'N');
  assert.equal(turn(turn('S', 'right'), 'left'), 'S');
});

test('facing east, a left turn then forward goes UP the board (y decreases)', () => {
  const { frames } = execute(makeLevel(), prog([L, F]));
  assert.deepEqual(positions(frames), ['0,4E', '0,4N', '0,3N']);
});

test('facing south, a right turn faces west', () => {
  const level = makeLevel({ start: { x: 2, y: 0, dir: 'S' } });
  const { frames } = execute(level, prog([R, F]));
  assert.deepEqual(positions(frames), ['2,0S', '2,0W', '1,0W']);
});

// ---- compile ---------------------------------------------------------------

test('compile flattens a plain program and records block paths', () => {
  const { steps, truncated } = compile(prog([F, L, F]));
  assert.equal(truncated, false);
  assert.deepEqual(steps.map((s) => [s.type, s.blockPath, s.ancestors]), [
    ['forward', 'main.0', []], ['left', 'main.1', []], ['forward', 'main.2', []],
  ]);
});

test('repeat expands its body, and every step points at the block inside the repeat', () => {
  const { steps } = compile(prog([F, rep(3, [F, R])]));
  assert.equal(steps.length, 1 + 3 * 2);
  assert.deepEqual(steps.slice(1, 3).map((s) => [s.type, s.blockPath, s.ancestors]), [
    ['forward', 'main.1.0', ['main.1']], ['right', 'main.1.1', ['main.1']],
  ]);
});

test('nested repeats multiply, and ancestors list outermost first', () => {
  const { steps } = compile(prog([rep(2, [rep(3, [F]), L])]));
  assert.equal(steps.length, 2 * (3 + 1));
  assert.deepEqual(steps[0].ancestors, ['main.0', 'main.0.0']);
  assert.equal(steps[0].blockPath, 'main.0.0.0');
  assert.deepEqual(steps[3].ancestors, ['main.0']);
});

test('calling Function F runs its body in place; the call block is an ancestor', () => {
  const { steps } = compile(prog([C, L, C], [F, F]));
  assert.deepEqual(steps.map((s) => s.type), ['forward', 'forward', 'left', 'forward', 'forward']);
  assert.deepEqual(steps[0], { type: 'forward', blockPath: 'f.0', ancestors: ['main.0'] });
  assert.deepEqual(steps[3], { type: 'forward', blockPath: 'f.0', ancestors: ['main.2'] });
});

test('a repeat inside Function F works and keeps paths inside f', () => {
  const { steps } = compile(prog([C], [rep(2, [F])]));
  assert.deepEqual(steps.map((s) => [s.blockPath, s.ancestors]), [
    ['f.0.0', ['main.0', 'f.0']], ['f.0.0', ['main.0', 'f.0']],
  ]);
});

test('calling F when F is empty adds no steps', () => {
  assert.deepEqual(compile(prog([C, C], [])).steps, []);
});

test('an empty repeat adds nothing and does not hang', () => {
  assert.deepEqual(compile(prog([rep(9, []), F])).steps.map((s) => s.type), ['forward']);
});

test('huge nested repeats stop at the 200-step cap without building a huge list', () => {
  const huge = prog([rep(9, [rep(9, [rep(9, [rep(9, [F])])])])]);
  const { steps, truncated } = compile(huge);
  assert.equal(truncated, true);
  assert.equal(steps.length, MAX_STEPS);
});

test('exactly 200 steps is fine; 201 is too many', () => {
  assert.equal(compile(prog([rep(9, [F]), rep(9, [F])])).truncated, false);
  const exactly = compile(prog(Array.from({ length: 200 }, () => F)));
  assert.equal(exactly.truncated, false);
  assert.equal(exactly.steps.length, 200);
  assert.equal(compile(prog(Array.from({ length: 201 }, () => F))).truncated, true);
});

test('endless recursion (F calls F) is cut off instead of overflowing the stack', () => {
  const { steps, truncated } = compile(prog([C], [F, C]));
  assert.equal(truncated, true);
  assert.ok(steps.length < MAX_STEPS, 'stopped by the depth guard, not by a stack overflow');
});

test('bad programs are rejected with a GameError', () => {
  assert.throws(() => compile(prog([{ type: 'jump' }])), { code: 'BAD_PROGRAM' });
  assert.throws(() => compile(prog([{ type: 'repeat', times: 0, body: [F] }])), { code: 'BAD_PROGRAM' });
  assert.throws(() => compile(prog([{ type: 'repeat', times: 2.5, body: [F] }])), { code: 'BAD_PROGRAM' });
});

// ---- running ---------------------------------------------------------------

test('reaching the battery at the end of the program is a success', () => {
  const { outcome, frames } = execute(makeLevel(), prog([F, F, F, F]));
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.reachedGoal, true);
  assert.equal(outcome.stepCount, 4);
  assert.deepEqual(positions(frames).at(-1), '4,4E');
});

test('passing over the battery but ending elsewhere is NOT a success', () => {
  const { outcome } = execute(makeLevel(), prog([F, F, F, F, L]), undefined);
  assert.equal(outcome.status, 'success', 'turning on the battery still ends on it');
  const past = execute(makeLevel({ goal: { x: 3, y: 4 } }), prog([F, F, F, F]));
  assert.equal(past.outcome.status, 'missed-goal');
  assert.equal(past.outcome.reachedGoal, false);
});

test('stopping short of the battery is "missed-goal"', () => {
  const { outcome } = execute(makeLevel(), prog([F, F]));
  assert.equal(outcome.status, 'missed-goal');
});

test('an empty program reports "empty"', () => {
  const { outcome, frames } = execute(makeLevel(), prog([]));
  assert.equal(outcome.status, 'empty');
  assert.equal(frames.length, 1);
});

test('hitting a wall stops the run at that step and keeps the robot in front of it', () => {
  const level = makeLevel({ walls: [[2, 4]] });
  const { frames, outcome } = execute(level, prog([F, F, F, F]));
  assert.equal(outcome.status, 'crashed');
  assert.deepEqual(outcome.crash, { kind: 'wall', step: 2, blockPath: 'main.1', ancestors: [] });
  assert.equal(frames.length, 3, 'nothing is played after the bump');
  assert.equal(frames.at(-1).event, 'bump');
  assert.deepEqual(positions(frames).at(-1), '1,4E');
  assert.equal(outcome.reachedGoal, false);
});

test('leaving the grid is a crash of kind "edge" on every side', () => {
  const cases = [
    [{ x: 0, y: 0, dir: 'N' }], [{ x: 4, y: 0, dir: 'E' }], [{ x: 4, y: 4, dir: 'S' }], [{ x: 0, y: 4, dir: 'W' }],
  ];
  for (const [start] of cases) {
    const { outcome } = execute(makeLevel({ start }), prog([F]));
    assert.equal(outcome.status, 'crashed', JSON.stringify(start));
    assert.equal(outcome.crash.kind, 'edge');
    assert.equal(outcome.crash.step, 1);
  }
});

test('a crash inside a repeat reports the block inside the repeat and its ancestors', () => {
  const level = makeLevel({ walls: [[3, 4]] });
  const { outcome } = execute(level, prog([rep(4, [F])]));
  assert.deepEqual(outcome.crash, { kind: 'wall', step: 3, blockPath: 'main.0.0', ancestors: ['main.0'] });
});

test('a crash wins over the step cap', () => {
  const level = makeLevel({ walls: [[1, 4]] });
  const { outcome } = run(level, { steps: [{ type: 'forward', blockPath: 'main.0', ancestors: [] }], truncated: true });
  assert.equal(outcome.status, 'crashed');
});

test('a program over the cap plays its first 200 steps then reports "too-many-steps"', () => {
  // Spin on the spot forever: never crashes, never ends on the battery.
  const { outcome, frames } = execute(makeLevel(), prog([rep(9, [rep(9, [rep(9, [L])])])]));
  assert.equal(outcome.status, 'too-many-steps');
  assert.equal(outcome.stepCount, MAX_STEPS);
  assert.equal(frames.length, MAX_STEPS + 1);
  assert.equal(outcome.reachedGoal, false, 'never a success once the cap is hit');
});

test('nested repeats and functions drive the robot correctly (staircase)', () => {
  // repeat 3 [forward, left, forward, right] climbs one step diagonally each time.
  const level = makeLevel({ size: [6, 6], start: { x: 0, y: 5, dir: 'E' }, goal: { x: 3, y: 2 } });
  assert.equal(execute(level, prog([rep(3, [F, L, F, R])])).outcome.status, 'success');
  // The same shape built from Function F.
  assert.equal(execute(level, prog([C, C, C], [F, L, F, R])).outcome.status, 'success');
});

// ---- gems ------------------------------------------------------------------

test('pick collects a gem on the robot\'s square and counts it', () => {
  const level = makeLevel({ gems: [[2, 4]] });
  const { frames, outcome } = execute(level, prog([F, F, P, F, F]));
  const pick = frames.find((f) => f.event === 'pick');
  assert.deepEqual(pick.picked, [2, 4]);
  assert.equal(pick.collected, 1);
  assert.equal(outcome.collected, 1);
  assert.equal(outcome.totalGems, 1);
  assert.equal(outcome.status, 'success');
});

test('pick on an empty square, or on a gem already taken, is harmless', () => {
  const level = makeLevel({ gems: [[1, 4]] });
  const { frames, outcome } = execute(level, prog([P, F, P, P, F, F, F]));
  assert.deepEqual(frames.map((f) => f.event).filter((e) => e.startsWith('pick')), ['pick-empty', 'pick', 'pick-empty']);
  assert.equal(outcome.collected, 1);
  assert.equal(outcome.status, 'success');
});

test('gems are optional for reaching the battery', () => {
  const level = makeLevel({ gems: [[2, 4]] });
  const { outcome } = execute(level, prog([F, F, F, F]));
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.collected, 0);
  assert.equal(outcome.totalGems, 1);
});
