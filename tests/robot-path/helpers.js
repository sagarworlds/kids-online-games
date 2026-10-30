// Shared builders for Robot Path tests (not a test file itself).

/** Command shorthands. */
export const F = { type: 'forward' };
export const L = { type: 'left' };
export const R = { type: 'right' };
export const P = { type: 'pick' };
export const C = { type: 'callF' };
/** @param {number} times @param {object[]} body */
export const rep = (times, body) => ({ type: 'repeat', times, body });

/** A program with only a main strip, or main + Function F. */
export const prog = (main, f = []) => ({ main, f });

/**
 * A small level for rule tests. Defaults to a 5x5 empty board, robot at (0,4) facing East,
 * battery at (4,4).
 * @param {Partial<import('../../src/games/robot-path/logic/levels.js').Level>} [over]
 */
export function makeLevel(over = {}) {
  return {
    id: 1, world: 1, title: 'test', tip: '', size: [5, 5],
    start: { x: 0, y: 4, dir: 'E' }, goal: { x: 4, y: 4 },
    walls: [], gems: [], par: 4, maxBlocks: 8,
    allowed: ['forward', 'left', 'right', 'repeat', 'pick', 'callF'],
    ...over,
  };
}
