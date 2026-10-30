// Test-only solver: breadth-first search over (x, y, facing) using forward / left / right.
// Used to prove a level can be reached at all, and to give the exact par for levels
// without loops (World 1), where the shortest command list IS the smallest program.
import { turn, DIRS } from '../../src/games/robot-path/logic/interpreter.js';

const DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

/**
 * @param {import('../../src/games/robot-path/logic/levels.js').Level} level
 * @returns {('forward'|'left'|'right')[]|null} The shortest list of commands that ends on the goal, or null.
 */
export function shortestCommands(level) {
  const [cols, rows] = level.size;
  const walls = new Set(level.walls.map(([x, y]) => `${x},${y}`));
  const key = (x, y, d) => `${x},${y},${d}`;
  const start = level.start;
  const queue = [{ x: start.x, y: start.y, dir: start.dir, path: [] }];
  const seen = new Set([key(start.x, start.y, start.dir)]);

  for (let head = 0; head < queue.length; head++) {
    const { x, y, dir, path } = queue[head];
    if (x === level.goal.x && y === level.goal.y && path.length > 0) return path;
    const moves = [['left', x, y, turn(dir, 'left')], ['right', x, y, turn(dir, 'right')]];
    const [dx, dy] = DELTA[dir];
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !walls.has(`${nx},${ny}`)) moves.push(['forward', nx, ny, dir]);
    for (const [cmd, mx, my, md] of moves) {
      const k = key(mx, my, md);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: mx, y: my, dir: md, path: [...path, cmd] });
    }
  }
  return null;
}

/**
 * Shortest *plain* program (no loops, no function) that picks up every gem and ends on the goal.
 * If this is longer than a level's `maxBlocks`, the level cannot be finished with plain blocks, so a
 * Repeat or Function F is genuinely required for the 3-star result.
 *
 * @param {import('../../src/games/robot-path/logic/levels.js').Level} level
 * @returns {number|null} Number of blocks, or null if the goal cannot be reached with every gem.
 */
export function shortestCollectingLength(level) {
  const [cols, rows] = level.size;
  const walls = new Set(level.walls.map(([x, y]) => `${x},${y}`));
  const gemBit = new Map(level.gems.map(([x, y], i) => [`${x},${y}`, 1 << i]));
  const all = (1 << level.gems.length) - 1;
  const queue = [{ x: level.start.x, y: level.start.y, dir: level.start.dir, mask: 0, n: 0 }];
  const seen = new Set([`${level.start.x},${level.start.y},${level.start.dir},0`]);

  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    if (c.x === level.goal.x && c.y === level.goal.y && c.mask === all && c.n > 0) return c.n;
    const next = [
      { ...c, dir: turn(c.dir, 'left') },
      { ...c, dir: turn(c.dir, 'right') },
    ];
    const [dx, dy] = DELTA[c.dir];
    const nx = c.x + dx;
    const ny = c.y + dy;
    if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !walls.has(`${nx},${ny}`)) next.push({ ...c, x: nx, y: ny });
    const bit = gemBit.get(`${c.x},${c.y}`);
    if (bit && !(c.mask & bit)) next.push({ ...c, mask: c.mask | bit });
    for (const state of next) {
      const key = `${state.x},${state.y},${state.dir},${state.mask}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ ...state, n: c.n + 1 });
    }
  }
  return null;
}

export { DIRS };
