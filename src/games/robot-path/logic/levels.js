import { invalidData } from '../../../engine/utils/errors.js';

/**
 * @typedef {{
 *   id: number, world: number, title: string, tip: string,
 *   size: [number, number],
 *   start: { x: number, y: number, dir: import('./interpreter.js').Dir },
 *   goal: { x: number, y: number },
 *   walls: [number, number][], gems: [number, number][],
 *   par: number, maxBlocks: number, allowed: string[]
 * }} Level
 * `size` is [columns, rows]. `par` is the block count that earns the efficiency star.
 *
 * @typedef {{ id: number, name: string, blurb: string, size: [number, number], allowed: string[] }} World
 */

const FILE = 'levels.json';
const COMMANDS = new Set(['forward', 'left', 'right', 'repeat', 'pick', 'callF']);
const START_DIR = Object.freeze({ '^': 'N', '>': 'E', v: 'S', '<': 'W' });
export const MAX_BLOCK_LIMIT = 20;

/** Key under which a level's stars are saved. */
export const levelKey = (id) => `level-${id}`;

/**
 * Validates `levels.json` and turns its readable ASCII maps into {@link Level} objects.
 *
 * Map legend: `.` empty, `#` wall, `*` gem, `G` battery (goal), and one start
 * square drawn as an arrow showing which way the robot faces: `^` `>` `v` `<`.
 * Rows run top to bottom, so the first row is the top of the board.
 *
 * @param {any} raw Parsed JSON.
 * @returns {{ worlds: World[], levels: Level[] }}
 * @throws {GameError} Code 'INVALID_DATA' naming the file and the exact field.
 */
export function parseLevels(raw) {
  if (!Array.isArray(raw?.worlds) || raw.worlds.length === 0) invalidData(FILE, 'worlds', 'must be a non-empty array');
  if (!Array.isArray(raw?.levels) || raw.levels.length === 0) invalidData(FILE, 'levels', 'must be a non-empty array');

  /** @type {World[]} */
  const worlds = raw.worlds.map((w, i) => {
    const at = `worlds[${i}]`;
    if (!Number.isInteger(w.id)) invalidData(FILE, `${at}.id`, 'must be a whole number');
    if (typeof w.name !== 'string' || !w.name) invalidData(FILE, `${at}.name`, 'must be a non-empty string');
    if (!Array.isArray(w.size) || w.size.length !== 2 || !w.size.every((n) => Number.isInteger(n) && n >= 2 && n <= 12)) {
      invalidData(FILE, `${at}.size`, 'must be [columns, rows] between 2 and 12');
    }
    if (!Array.isArray(w.allowed) || w.allowed.length === 0 || !w.allowed.every((c) => COMMANDS.has(c))) {
      invalidData(FILE, `${at}.allowed`, `must list commands from ${[...COMMANDS].join(', ')}`);
    }
    return { id: w.id, name: w.name, blurb: String(w.blurb ?? ''), size: [w.size[0], w.size[1]], allowed: [...w.allowed] };
  });

  const seen = new Set();
  /** @type {Level[]} */
  const levels = raw.levels.map((l, i) => {
    const at = `levels[${i}]`;
    if (!Number.isInteger(l.id) || l.id < 1) invalidData(FILE, `${at}.id`, 'must be a whole number from 1');
    if (seen.has(l.id)) invalidData(FILE, `${at}.id`, `${l.id} is used twice`);
    seen.add(l.id);
    const world = worlds.find((w) => w.id === l.world);
    if (!world) invalidData(FILE, `${at}.world`, `refers to unknown world ${l.world}`);
    if (typeof l.title !== 'string' || !l.title) invalidData(FILE, `${at}.title`, 'must be a non-empty string');
    if (!Array.isArray(l.map)) invalidData(FILE, `${at}.map`, 'must be an array of row strings');

    const [cols, rows] = world.size;
    if (l.map.length !== rows) invalidData(FILE, `${at}.map`, `must have ${rows} rows (has ${l.map.length})`);

    let start = null;
    let goal = null;
    const walls = [];
    const gems = [];
    l.map.forEach((row, y) => {
      if (typeof row !== 'string' || row.length !== cols) invalidData(FILE, `${at}.map[${y}]`, `must be ${cols} characters`);
      [...row].forEach((ch, x) => {
        if (ch === '#') walls.push([x, y]);
        else if (ch === '*') gems.push([x, y]);
        else if (ch === 'G') {
          if (goal) invalidData(FILE, `${at}.map[${y}]`, 'has a second goal (G)');
          goal = { x, y };
        } else if (START_DIR[ch]) {
          if (start) invalidData(FILE, `${at}.map[${y}]`, 'has a second start square');
          start = { x, y, dir: START_DIR[ch] };
        } else if (ch !== '.') {
          invalidData(FILE, `${at}.map[${y}]`, `has unknown character "${ch}" at column ${x}`);
        }
      });
    });
    if (!start) invalidData(FILE, `${at}.map`, 'needs a start square (^ > v <)');
    if (!goal) invalidData(FILE, `${at}.map`, 'needs a goal (G)');
    if (gems.length > 0 && !world.allowed.includes('pick')) {
      invalidData(FILE, `${at}.map`, `has gems but world ${world.id} has no "pick" block`);
    }

    if (!Number.isInteger(l.par) || l.par < 1) invalidData(FILE, `${at}.par`, 'must be a whole number from 1');
    if (!Number.isInteger(l.maxBlocks) || l.maxBlocks < l.par || l.maxBlocks > MAX_BLOCK_LIMIT) {
      invalidData(FILE, `${at}.maxBlocks`, `must be a whole number from par (${l.par}) to ${MAX_BLOCK_LIMIT}`);
    }

    return {
      id: l.id, world: world.id, title: l.title, tip: String(l.tip ?? ''),
      size: [cols, rows], start, goal, walls, gems, par: l.par, maxBlocks: l.maxBlocks, allowed: [...world.allowed],
    };
  });

  return { worlds, levels: levels.sort((a, b) => a.id - b.id) };
}

/**
 * @param {Level[]} levels
 * @param {number} id
 * @returns {Level|undefined}
 */
export const findLevel = (levels, id) => levels.find((l) => l.id === id);
