import { GameError } from '../../../engine/utils/errors.js';
import { shortestTurn } from '../../../engine/three/motionMath.js';

/**
 * Where things stand in the 3D board, which way the robot faces, and what each step of a run looks like. Pure numbers
 * only (no three.js), so the geometry that decides "left" and "right" is tested without a browser.
 *
 * The scene's axes: x runs to the right and z towards the viewer, so the board's rows (which run top to bottom in the
 * 2D picture) run along +z, North (up the 2D board) is -z, and a camera at azimuth 0 sees the board just as the 2D
 * picture does. Heights are y. The board is centred on the origin.
 *
 * @typedef {import('./interpreter.js').Dir} Dir
 * @typedef {import('./interpreter.js').Frame} Frame
 * @typedef {{ x: number, z: number, yaw: number }} Pose  `yaw` is the turn about the vertical axis, in radians. It
 *   accumulates (a robot that has turned right four times has a yaw of -2 PI, not 0) so a turn is always the short way.
 */

/** The width of one board square in the scene. */
export const TILE = 1;

/**
 * The yaw that makes a robot face each compass direction. A robot is modelled facing -z (North) at yaw 0. Turning
 * to the right is clockwise seen from above, which is a negative yaw about the vertical axis, so East (to the right of
 * North) is -90 degrees and West is +90.
 * @type {Readonly<Record<Dir, number>>}
 */
export const HEADING_YAW = Object.freeze({ N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 });

/** How long each kind of step takes to play, in seconds (a little under the 0.4 s between blocks, so each one finishes). */
export const STEP_DURATION = Object.freeze({ move: 0.32, turn: 0.28, bump: 0.34, pick: 0.34, wobble: 0.3 });

/** How far a robot that is stopped by a rock or the edge leans into it before bouncing back. */
export const LUNGE = 0.3 * TILE;

/**
 * @param {Dir} dir
 * @returns {number} The yaw that faces that way.
 * @throws {GameError} 'BAD_DIR' for anything but N, E, S or W.
 */
export function yawFor(dir) {
  if (!Object.hasOwn(HEADING_YAW, dir)) throw new GameError('BAD_DIR', `a direction is N, E, S or W (got ${dir})`, { dir });
  return HEADING_YAW[dir];
}

/**
 * The centre of a board square.
 * @param {number} x Column, from 0 at the left.
 * @param {number} y Row, from 0 at the top (the 2D picture's rows).
 * @param {readonly [number, number]} size Columns and rows.
 * @returns {{ x: number, z: number }}
 */
export function cellCenter(x, y, [cols, rows]) {
  return { x: (x - (cols - 1) / 2) * TILE, z: (y - (rows - 1) / 2) * TILE };
}

/**
 * The yaw to turn to so the robot faces `dir`, reached by the shortest turn from where it already is.
 * @param {number} currentYaw Where the robot is facing now (any number of whole turns).
 * @param {Dir} dir
 * @returns {number}
 * @throws {GameError} 'BAD_DIR'.
 */
export function turnedYaw(currentYaw, dir) {
  return currentYaw + shortestTurn(currentYaw, yawFor(dir));
}

/**
 * The direction a robot at `yaw` is looking, flat on the ground.
 * @param {number} yaw
 * @returns {{ x: number, z: number }} A vector of length 1.
 */
export const forwardVector = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/** @param {import("./levels.js").Level} level @returns {Pose} Where the robot is before its first block. */
export function startPose(level) {
  const at = cellCenter(level.start.x, level.start.y, level.size);
  return { x: at.x, z: at.z, yaw: yawFor(level.start.dir) };
}

/**
 * @typedef {{
 *   kind: 'none'|'move'|'turn'|'bump'|'pick'|'wobble',
 *   from: Pose, to: Pose, seconds: number,
 *   gem: string|null
 * }} Motion What the robot does for one step. `gem` is "x,y" of the gem picked up, if any.
 */

/**
 * Turns one frame of the interpreter's trace into what the robot does on screen: slide to the next square, turn on the
 * spot, lean into a rock and bounce back, hop to pick up a gem. The robot only ever *shows* the trace, so what the child
 * sees is exactly what the rules computed.
 *
 * @param {Pose} from Where the robot was after the previous step.
 * @param {Frame} frame The step to show.
 * @param {readonly [number, number]} size Columns and rows.
 * @returns {Motion}
 * @throws {GameError} 'BAD_DIR' (from the frame's direction).
 */
export function planStep(from, frame, size) {
  const at = cellCenter(frame.x, frame.y, size);
  const yaw = turnedYaw(from.yaw, frame.dir);
  switch (frame.event) {
    case 'move':
      return { kind: 'move', from, to: { x: at.x, z: at.z, yaw }, seconds: STEP_DURATION.move, gem: null };
    case 'turn':
      return { kind: 'turn', from, to: { x: at.x, z: at.z, yaw }, seconds: STEP_DURATION.turn, gem: null };
    case 'bump':
    case 'edge':
      // A stopped robot has not moved, so it ends where it began; the lean is drawn by the scene from its `kind`.
      return { kind: 'bump', from, to: { x: at.x, z: at.z, yaw }, seconds: STEP_DURATION.bump, gem: null };
    case 'pick':
      return { kind: 'pick', from, to: { x: at.x, z: at.z, yaw }, seconds: STEP_DURATION.pick, gem: frame.picked ? frame.picked.join(',') : null };
    case 'pick-empty':
      return { kind: 'wobble', from, to: { x: at.x, z: at.z, yaw }, seconds: STEP_DURATION.wobble, gem: null };
    default:
      return { kind: 'none', from, to: { x: at.x, z: at.z, yaw }, seconds: 0, gem: null };
  }
}

/**
 * How the robot is placed part-way through a motion.
 * @param {Motion} motion
 * @param {number} progress 0 to 1, already eased.
 * @returns {{ x: number, z: number, yaw: number, lift: number, lean: number, squash: number, roll: number }}
 *   `lift` is height above the floor, `lean` is how far it has pushed forward into an obstacle, `squash` is how much it
 *   is squeezed on impact (0 to 1) and `roll` is a sideways wobble in radians.
 */
export function poseAt(motion, progress) {
  const u = Math.min(1, Math.max(0, progress));
  // 0 at both ends, 1 in the middle. sin(PI) is 1.2e-16, not 0, so the ends are set exactly: the robot must be on the floor.
  const arc = u === 0 || u === 1 ? 0 : Math.sin(Math.PI * u);
  const base = {
    x: motion.from.x + (motion.to.x - motion.from.x) * u,
    z: motion.from.z + (motion.to.z - motion.from.z) * u,
    yaw: motion.from.yaw + (motion.to.yaw - motion.from.yaw) * u,
    lift: 0, lean: 0, squash: 0, roll: 0,
  };
  switch (motion.kind) {
    case 'move': return { ...base, lift: 0.07 * arc };
    case 'bump': return { ...base, lean: LUNGE * arc, squash: arc };
    case 'pick': return { ...base, lift: 0.28 * arc };
    case 'wobble': return { ...base, roll: 0.14 * Math.sin(2 * Math.PI * u) };
    default: return base;
  }
}

// ---------------------------------------------------------------------------------------------------- the camera

/** The camera's tilt when it rides behind the robot: low enough to see where it is heading, high enough to see the floor. */
export const CHASE_POLAR = 1.2;
export const CHASE_DISTANCE = 4.6;
const CHASE_HEIGHT = 0.45;

/**
 * Where the camera goes to ride behind the robot ("robot's view"), looking the way it looks. Then a left turn bends the
 * picture to the left and a right turn to the right: the learning point of the game, since "left" and "right" in a
 * program are the robot's own, whichever way the board is turned.
 *
 * The orbit's azimuth is the yaw: an azimuth of A puts the camera at (sin A, cos A) from its target, which is exactly
 * behind a robot facing (-sin A, -cos A).
 *
 * @param {{ x: number, z: number, yaw: number }} robot
 * @returns {{ azimuth: number, polar: number, distance: number, target: { x: number, y: number, z: number } }}
 */
export function chaseCamera(robot) {
  return { azimuth: robot.yaw, polar: CHASE_POLAR, distance: CHASE_DISTANCE, target: { x: robot.x, y: CHASE_HEIGHT, z: robot.z } };
}

/** The tilt of the camera when the whole board is in view, as in the 2D picture but at an angle. */
export const MAP_POLAR = 0.85;

/**
 * How far the camera stands from a board so the whole of it is in view, on a wide or a narrow screen.
 * The board's corner is its farthest point from the middle, so the distance is worked out from that circle.
 *
 * @param {{ size: readonly [number, number], aspect: number, fovDegrees?: number }} options `aspect` is width / height.
 * @returns {number}
 */
export function boardDistance({ size, aspect, fovDegrees = 45 }) {
  const [cols, rows] = size;
  const radius = Math.hypot(cols * TILE, rows * TILE) / 2 + 0.5 * TILE;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? Math.min(aspect, 1.2) : 1;
  return radius / (Math.tan((fovDegrees * Math.PI) / 360) * safeAspect);
}
