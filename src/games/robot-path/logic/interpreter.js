import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {'forward'|'left'|'right'|'pick'|'repeat'|'callF'} CommandType
 * @typedef {{ type: CommandType, times?: number, body?: Command[] }} Command
 * @typedef {{ main: Command[], f: Command[] }} Program
 *   `main` is the program strip; `f` is the body of the child's Function F (World 3).
 *
 * @typedef {{ type: 'forward'|'left'|'right'|'pick', blockPath: string, ancestors: string[] }} Step
 *   `blockPath` identifies the block that produced the step ("main.2", "main.1.0" for the
 *   first block inside the repeat at index 1, "f.0" inside Function F); `ancestors` are the
 *   repeat/call blocks around it, outermost first, so the UI can light up the whole chain.
 *
 * @typedef {'N'|'E'|'S'|'W'} Dir
 * @typedef {{
 *   step: number, x: number, y: number, dir: Dir,
 *   event: 'start'|'move'|'turn'|'bump'|'edge'|'pick'|'pick-empty',
 *   blockPath: string|null, ancestors: string[], collected: number, picked: [number, number]|null
 * }} Frame One entry per executed step (plus the initial 'start' frame).
 *
 * @typedef {{
 *   status: 'empty'|'crashed'|'too-many-steps'|'missed-goal'|'success',
 *   stepCount: number, reachedGoal: boolean, collected: number, totalGems: number,
 *   crash: { kind: 'wall'|'edge', step: number, blockPath: string, ancestors: string[] }|null
 * }} Outcome
 */

/** Safety cap from the spec: a program that would take more steps than this is stopped. */
export const MAX_STEPS = 200;
/** How deeply Function F may call itself before we give up (guards against endless recursion). */
const MAX_CALL_DEPTH = 8;

export const DIRS = Object.freeze(['N', 'E', 'S', 'W']);
/** x grows to the right, y grows downward, so North is "up the screen". */
const DELTA = Object.freeze({ N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] });

/**
 * The key idea of the game: turns are relative to where the robot faces.
 * @param {Dir} dir Current facing.
 * @param {'left'|'right'} side Which way the robot turns.
 * @returns {Dir}
 */
export function turn(dir, side) {
  const i = DIRS.indexOf(dir);
  // Clockwise is +1; a left turn is three clockwise quarter-turns (-1 mod 4).
  return DIRS[(i + (side === 'right' ? 1 : 3)) % 4];
}

const LEAF_TYPES = new Set(['forward', 'left', 'right', 'pick']);

/**
 * Flattens repeats and Function F calls into a plain list of steps.
 * Stops (and reports `truncated`) as soon as the list would exceed `cap`, so a
 * huge or endless program never builds a huge array.
 *
 * @param {Program} program
 * @param {{ cap?: number }} [options]
 * @returns {{ steps: Step[], truncated: boolean }}
 * @throws {GameError} 'BAD_PROGRAM' for an unknown command or an invalid repeat count.
 */
export function compile(program, { cap = MAX_STEPS } = {}) {
  /** @type {Step[]} */
  const steps = [];
  let truncated = false;

  function walk(commands, prefix, ancestors, depth) {
    for (let i = 0; i < commands.length && !truncated; i++) {
      const command = commands[i];
      const id = `${prefix}.${i}`;
      if (LEAF_TYPES.has(command.type)) {
        if (steps.length >= cap) {
          truncated = true;
        } else {
          steps.push({ type: command.type, blockPath: id, ancestors });
        }
      } else if (command.type === 'repeat') {
        const times = command.times;
        if (!Number.isInteger(times) || times < 1) {
          throw new GameError('BAD_PROGRAM', `repeat at ${id} needs a whole number of times (got ${times})`, { id });
        }
        const body = command.body ?? [];
        if (body.length === 0) continue; // nothing to run; skip rather than loop `times` times for nothing
        for (let t = 0; t < times && !truncated; t++) walk(body, id, [...ancestors, id], depth);
      } else if (command.type === 'callF') {
        if (depth >= MAX_CALL_DEPTH) truncated = true;
        else walk(program.f ?? [], 'f', [...ancestors, id], depth + 1);
      } else {
        throw new GameError('BAD_PROGRAM', `unknown command "${command.type}" at ${id}`, { id });
      }
    }
  }

  walk(program.main ?? [], 'main', [], 0);
  return { steps, truncated };
}

/**
 * Plays steps on a level and records what the robot did, without any drawing
 * or timing. The scene just replays the returned frames.
 *
 * Rules: a wall or the edge of the grid stops the run (the robot "bumps");
 * the run only counts as a success if the robot *ends* on the battery;
 * `pick` collects a gem on the robot's square and is harmless elsewhere.
 *
 * @param {import('./levels.js').Level} level
 * @param {{ steps: Step[], truncated?: boolean }} compiled
 * @returns {{ frames: Frame[], outcome: Outcome }}
 */
export function run(level, { steps, truncated = false }) {
  const [cols, rows] = level.size;
  const walls = new Set(level.walls.map(([x, y]) => `${x},${y}`));
  const gems = new Set(level.gems.map(([x, y]) => `${x},${y}`));
  const picked = new Set();

  let { x, y, dir } = level.start;
  /** @type {Frame[]} */
  const frames = [{ step: 0, x, y, dir, event: 'start', blockPath: null, ancestors: [], collected: 0, picked: null }];
  let crash = null;

  for (let i = 0; i < steps.length && !crash; i++) {
    const step = steps[i];
    const number = i + 1;
    let event;
    let pickedAt = null;

    if (step.type === 'left' || step.type === 'right') {
      dir = turn(dir, step.type);
      event = 'turn';
    } else if (step.type === 'forward') {
      const [dx, dy] = DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
        event = 'edge';
        crash = { kind: 'edge', step: number, blockPath: step.blockPath, ancestors: step.ancestors };
      } else if (walls.has(`${nx},${ny}`)) {
        event = 'bump';
        crash = { kind: 'wall', step: number, blockPath: step.blockPath, ancestors: step.ancestors };
      } else {
        x = nx;
        y = ny;
        event = 'move';
      }
    } else {
      const key = `${x},${y}`;
      if (gems.has(key) && !picked.has(key)) {
        picked.add(key);
        pickedAt = [x, y];
        event = 'pick';
      } else {
        event = 'pick-empty';
      }
    }
    frames.push({ step: number, x, y, dir, event, blockPath: step.blockPath, ancestors: step.ancestors, collected: picked.size, picked: pickedAt });
  }

  const reachedGoal = x === level.goal.x && y === level.goal.y;
  let status;
  if (steps.length === 0) status = 'empty';
  else if (crash) status = 'crashed';
  else if (truncated) status = 'too-many-steps';
  else status = reachedGoal ? 'success' : 'missed-goal';

  return {
    frames,
    outcome: {
      status, stepCount: frames.length - 1, reachedGoal: reachedGoal && !crash && !truncated,
      collected: picked.size, totalGems: gems.size, crash,
    },
  };
}

/**
 * Convenience: compile then run.
 * @param {import('./levels.js').Level} level
 * @param {Program} program
 * @returns {{ frames: Frame[], outcome: Outcome }}
 */
export function execute(level, program) {
  return run(level, compile(program));
}
