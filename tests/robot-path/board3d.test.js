// The geometry behind Robot Path's 3D board: where squares are, which way "left" and "right" turn, and what each step of a
// run looks like. None of it imports three.js, so it runs without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameError } from '../../src/engine/utils/errors.js';
import { orbitPosition } from '../../src/engine/three/orbitMath.js';
import { parseLevels } from '../../src/games/robot-path/logic/levels.js';
import { execute, turn, DIRS } from '../../src/games/robot-path/logic/interpreter.js';
import {
  TILE, HEADING_YAW, STEP_DURATION, LUNGE, yawFor, cellCenter, turnedYaw, forwardVector, startPose, planStep, poseAt,
  chaseCamera, boardDistance, CHASE_DISTANCE,
} from '../../src/games/robot-path/logic/board3d.js';
import { shortestCommands } from './solver.js';
import { solutions } from './solutions.js';
import { F, L, R, P, rep, prog, makeLevel } from './helpers.js';

const raw = JSON.parse(readFileSync(new URL('../../src/games/robot-path/data/levels.json', import.meta.url), 'utf8'));
const { levels } = parseLevels(raw);
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code, `expected ${code}`);
/** The same direction, whatever whole number of turns the yaw has gathered. */
const sameHeading = (yaw, dir) => assert.ok(Math.abs(Math.sin((yaw - yawFor(dir)) / 2)) < 1e-9, `yaw ${yaw} does not face ${dir}`);

/** Plays a whole run through `planStep`, as the 3D board does, and returns every motion and where the robot ends. */
function playRun(level, program) {
  const { frames } = execute(level, program);
  let pose = startPose(level);
  const motions = [];
  for (const frame of frames.slice(1)) {
    const motion = planStep(pose, frame, level.size);
    motions.push(motion);
    pose = motion.to;
  }
  return { frames, motions, pose };
}

/** The reference program for a level (World 1's is the shortest path, found by the solver). */
const referenceProgram = (level) => (solutions[level.id] ?? prog(shortestCommands(level).map((type) => ({ type }))));

// ---- squares and headings ---------------------------------------------------------------------------

test('the board is centred on the origin and its rows run towards the viewer', () => {
  assert.deepEqual(cellCenter(0, 0, [5, 5]), { x: -2 * TILE, z: -2 * TILE });
  assert.deepEqual(cellCenter(2, 2, [5, 5]), { x: 0, z: 0 });
  assert.deepEqual(cellCenter(4, 4, [5, 5]), { x: 2 * TILE, z: 2 * TILE });
  // A board with an even number of squares has its middle on a line between two squares.
  assert.deepEqual(cellCenter(0, 0, [6, 6]), { x: -2.5 * TILE, z: -2.5 * TILE });
  assert.deepEqual(cellCenter(5, 0, [6, 6]), { x: 2.5 * TILE, z: -2.5 * TILE });
  // One step East (to the right in the 2D picture) is +x; one step South (down the picture) is +z.
  near(cellCenter(3, 1, [5, 5]).x - cellCenter(2, 1, [5, 5]).x, TILE);
  near(cellCenter(1, 3, [5, 5]).z - cellCenter(1, 2, [5, 5]).z, TILE);
});

test('every compass direction has a yaw, and anything else is refused', () => {
  assert.deepEqual(Object.keys(HEADING_YAW), DIRS.slice());
  for (const bad of ['X', 'n', '', undefined, null, 'NE']) throwsCode(() => yawFor(bad), 'BAD_DIR');
});

test('a robot at each heading looks the way its compass direction points on the 2D board', () => {
  const toward = (dir) => forwardVector(yawFor(dir));
  const north = toward('N');
  const east = toward('E');
  const south = toward('S');
  const west = toward('W');
  near(north.x, 0); near(north.z, -1); // up the board is away from the viewer
  near(east.x, 1); near(east.z, 0); // right
  near(south.x, 0); near(south.z, 1); // down the board is towards the viewer
  near(west.x, -1); near(west.z, 0); // left
});

test('"turn right" is clockwise seen from above, "turn left" anticlockwise, from every heading', () => {
  for (const dir of DIRS) {
    const start = forwardVector(yawFor(dir));
    for (const [side, expectedSign] of [['right', -1], ['left', 1]]) {
      const after = turnedYaw(yawFor(dir), turn(dir, side));
      const delta = after - yawFor(dir);
      near(Math.abs(delta), Math.PI / 2, 1e-9);
      assert.equal(Math.sign(delta), expectedSign, `${side} from ${dir}`);
      // Seen from above (x to the right, z towards the viewer), clockwise carries the nose from up to the right.
      const nose = forwardVector(after);
      const cross = start.x * nose.z - start.z * nose.x; // positive when the turn is clockwise on the screen
      assert.equal(Math.sign(cross), side === 'right' ? 1 : -1, `${side} from ${dir} on the screen`);
    }
  }
});

test('turning never swings the long way round, however many turns have gathered', () => {
  let yaw = yawFor('N');
  // Four right turns in a row come back to the start by turning -90 degrees each time, not by one big swing at the end.
  for (const dir of ['E', 'S', 'W', 'N']) {
    const next = turnedYaw(yaw, dir);
    near(Math.abs(next - yaw), Math.PI / 2, 1e-9);
    yaw = next;
  }
  near(yaw, -2 * Math.PI, 1e-9);
  sameHeading(yaw, 'N');
  // Turning round to face the opposite way is a half turn, whichever way it goes.
  near(Math.abs(turnedYaw(0, 'S') - 0), Math.PI, 1e-9);
});

// ---- the camera --------------------------------------------------------------------------------------

test('the robot\'s-view camera sits behind the robot and looks where it looks, for every heading and position', () => {
  for (const dir of DIRS) {
    for (const yaw of [yawFor(dir), yawFor(dir) + 2 * Math.PI, yawFor(dir) - 4 * Math.PI]) {
      const robot = { x: 1.5, z: -0.5, yaw };
      const goal = chaseCamera(robot);
      const eye = orbitPosition({ azimuth: goal.azimuth, polar: goal.polar, distance: goal.distance }, goal.target);
      const forward = forwardVector(yaw);
      // The camera is behind: from the robot to the camera is the opposite of the way the robot faces.
      const back = { x: eye.x - robot.x, z: eye.z - robot.z };
      const length = Math.hypot(back.x, back.z);
      near(back.x / length, -forward.x, 1e-9);
      near(back.z / length, -forward.z, 1e-9);
      // And it looks at the robot, a little above the floor.
      assert.deepEqual({ x: goal.target.x, z: goal.target.z }, { x: robot.x, z: robot.z });
      assert.ok(eye.y > goal.target.y, 'above the robot, looking down at it');
    }
  }
  assert.equal(chaseCamera({ x: 0, z: 0, yaw: 0 }).distance, CHASE_DISTANCE);
});

test('the board fills the view on a tall phone and on a wide screen, and survives a nonsense shape', () => {
  for (const size of [[5, 5], [6, 6], [7, 7]]) {
    const halfWidth = (distance, aspect) => distance * Math.tan((45 * Math.PI) / 360) * Math.min(aspect, 1.2);
    for (const aspect of [0.46, 0.8, 1, 1.6, 2.4]) {
      const distance = boardDistance({ size, aspect });
      assert.ok(halfWidth(distance, aspect) >= Math.hypot(...size) / 2, `${size} at ${aspect}`);
    }
  }
  assert.ok(boardDistance({ size: [7, 7], aspect: 1 }) > boardDistance({ size: [5, 5], aspect: 1 }), 'a bigger board needs the camera farther back');
  assert.ok(boardDistance({ size: [5, 5], aspect: 0.5 }) > boardDistance({ size: [5, 5], aspect: 1 }));
  assert.equal(boardDistance({ size: [5, 5], aspect: NaN }), boardDistance({ size: [5, 5], aspect: 1 }));
  assert.equal(boardDistance({ size: [5, 5], aspect: 3 }), boardDistance({ size: [5, 5], aspect: 1.2 }));
});

// ---- what each step looks like ---------------------------------------------------------------------

test('the robot starts on its start square, facing the way the level says', () => {
  for (const level of levels) {
    const pose = startPose(level);
    const at = cellCenter(level.start.x, level.start.y, level.size);
    assert.deepEqual({ x: pose.x, z: pose.z }, at);
    sameHeading(pose.yaw, level.start.dir);
  }
});

test('forward slides to the next square, a turn turns on the spot, and the robot does not hop sideways', () => {
  const level = makeLevel();
  const [forward, turnRight, turnLeft] = ['forward', 'right', 'left'].map((type) => playRun(level, prog([{ type }])).motions[0]);
  assert.equal(forward.kind, 'move');
  near(forward.to.x - forward.from.x, TILE);
  near(forward.to.z, forward.from.z);
  assert.equal(forward.to.yaw, forward.from.yaw);
  assert.equal(turnRight.kind, 'turn');
  assert.deepEqual({ x: turnRight.to.x, z: turnRight.to.z }, { x: turnRight.from.x, z: turnRight.from.z });
  assert.ok(turnRight.to.yaw < turnRight.from.yaw, 'right is clockwise (a falling yaw)');
  assert.ok(turnLeft.to.yaw > turnLeft.from.yaw, 'left is anticlockwise (a rising yaw)');
  assert.equal(forward.seconds, STEP_DURATION.move);
});

test('running into a rock or the edge leans in and bounces back to the same square', () => {
  const rock = makeLevel({ walls: [[1, 4]] });
  const intoRock = playRun(rock, prog([F])).motions[0];
  assert.equal(intoRock.kind, 'bump');
  assert.deepEqual(intoRock.to, intoRock.from, 'a stopped robot ends where it began');
  const edge = makeLevel({ start: { x: 0, y: 4, dir: 'W' } });
  assert.equal(playRun(edge, prog([F])).motions[0].kind, 'bump');
  // Half way through, it has leaned forward into the obstacle, and at both ends it has not.
  assert.equal(poseAt(intoRock, 0).lean, 0);
  assert.equal(poseAt(intoRock, 1).lean, 0);
  near(poseAt(intoRock, 0.5).lean, LUNGE);
  assert.ok(poseAt(intoRock, 0.5).squash > 0.99);
});

test('picking up a gem hops and names the gem; picking where there is none only wobbles', () => {
  const level = makeLevel({ gems: [[1, 4]] });
  const { motions } = playRun(level, prog([F, P, P]));
  assert.equal(motions[1].kind, 'pick');
  assert.equal(motions[1].gem, '1,4');
  assert.ok(poseAt(motions[1], 0.5).lift > 0.2);
  assert.equal(motions[2].kind, 'wobble');
  assert.equal(motions[2].gem, null);
  assert.equal(poseAt(motions[2], 0).roll, 0);
  assert.ok(Math.abs(poseAt(motions[2], 0.25).roll) > 0.1);
});

test('the pose part-way through a move is between the two squares, and the robot is on the floor at both ends', () => {
  const motion = playRun(makeLevel(), prog([F])).motions[0];
  const middle = poseAt(motion, 0.5);
  near(middle.x, (motion.from.x + motion.to.x) / 2);
  assert.ok(middle.lift > 0);
  assert.equal(poseAt(motion, 0).lift, 0);
  near(poseAt(motion, 1).lift, 0, 1e-12);
  assert.deepEqual({ x: poseAt(motion, 5).x, z: poseAt(motion, 5).z }, { x: motion.to.x, z: motion.to.z }, 'progress past the end is held at the end');
  assert.deepEqual({ x: poseAt(motion, -1).x, z: poseAt(motion, -1).z }, { x: motion.from.x, z: motion.from.z });
});

test('a frame with no event of its own (the start) is no motion at all', () => {
  const level = makeLevel();
  const start = execute(level, prog([F])).frames[0];
  const motion = planStep(startPose(level), start, level.size);
  assert.equal(motion.kind, 'none');
  assert.equal(motion.seconds, 0);
});

test('playing every level\'s reference solution step by step ends where the rules say, never turning the long way', () => {
  for (const level of levels) {
    const { frames, motions, pose } = playRun(level, referenceProgram(level));
    const last = frames.at(-1);
    const at = cellCenter(last.x, last.y, level.size);
    near(pose.x, at.x, 1e-9);
    near(pose.z, at.z, 1e-9);
    sameHeading(pose.yaw, last.dir);
    for (const motion of motions) {
      if (motion.kind === 'turn') near(Math.abs(motion.to.yaw - motion.from.yaw), Math.PI / 2, 1e-9);
      else near(motion.to.yaw, motion.from.yaw, 1e-9);
      if (motion.kind === 'move') near(Math.hypot(motion.to.x - motion.from.x, motion.to.z - motion.from.z), TILE, 1e-9);
      assert.ok(motion.seconds <= 0.4, 'a step finishes before the next block starts');
    }
  }
});

test('the robot\'s own left and right stay its own when the board is turned (the idea the 3D view teaches)', () => {
  // A program that turns right then goes forward takes the robot to its own right, whichever way it was facing.
  for (const dir of DIRS) {
    const level = makeLevel({ start: { x: 2, y: 2, dir }, goal: { x: 0, y: 0 } });
    const { motions } = playRun(level, prog([R, F]));
    const facing = forwardVector(motions[0].from.yaw);
    const step = { x: motions[1].to.x - motions[1].from.x, z: motions[1].to.z - motions[1].from.z };
    // The step is a quarter turn clockwise (seen from above) from where it faced.
    const cross = facing.x * step.z - facing.z * step.x;
    const dot = facing.x * step.x + facing.z * step.z;
    near(dot, 0, 1e-9);
    assert.ok(cross > 0.99, `${dir}: the robot went to its right`);
  }
});

test('a repeat of turns comes back to its heading with the yaw only ever moving a quarter at a time', () => {
  const level = makeLevel({ start: { x: 2, y: 2, dir: 'N' }, goal: { x: 4, y: 4 } });
  const { motions, pose } = playRun(level, prog([rep(4, [R])]));
  assert.equal(motions.length, 4);
  near(pose.yaw, startPose(level).yaw - 2 * Math.PI, 1e-9);
  sameHeading(pose.yaw, 'N');
});
