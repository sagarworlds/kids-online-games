import { GameError } from '../../../engine/utils/errors.js';

/**
 * @typedef {'+'|'-'|'x'|'/'} Op
 * @typedef {{
 *   id: 'easy'|'medium'|'hard', label: string, blurb: string, ops: Op[],
 *   addSub: { min: number, max: number },
 *   tables: { min: number, max: number }|null, factorMax: number|null,
 *   fallTime: { start: number, min: number }, maxOnScreen: number
 * }} LevelConfig
 *
 * `addSub`: both operands and the result stay in [0, max]; operands are at
 *   least `min` so Medium/Hard do not hand out trivial sums like 2 + 3.
 * `tables`: the times table (one factor, or the divisor) comes from this range.
 * `factorMax`: the other factor (or the quotient) is 2..factorMax.
 * `fallTime`: seconds for a star to fall top to ground; starts at `start` and
 *   speeds up (never faster than `min`) as the child answers correctly.
 */

/** Symbols shown to the child. Internal ids stay ASCII so they are easy to type in code and tests. */
export const OP_SYMBOL = Object.freeze({ '+': '+', '-': '−', x: '×', '/': '÷' });
export const OP_NAME = Object.freeze({ '+': 'Add', '-': 'Subtract', x: 'Multiply', '/': 'Divide' });

/** @type {Readonly<Record<'easy'|'medium'|'hard', Readonly<LevelConfig>>>} */
export const LEVELS = Object.freeze({
  easy: Object.freeze({
    id: 'easy', label: 'Easy', blurb: 'Add and take away, up to 20',
    ops: ['+', '-'],
    addSub: { min: 1, max: 20 }, tables: null, factorMax: null,
    fallTime: { start: 12, min: 9 }, maxOnScreen: 2,
  }),
  medium: Object.freeze({
    id: 'medium', label: 'Medium', blurb: 'Up to 100, times tables 2–5',
    ops: ['+', '-', 'x'],
    addSub: { min: 5, max: 100 }, tables: { min: 2, max: 5 }, factorMax: 10,
    fallTime: { start: 10, min: 7 }, maxOnScreen: 3,
  }),
  hard: Object.freeze({
    id: 'hard', label: 'Hard', blurb: 'Up to 500, tables 2–12, division',
    ops: ['+', '-', 'x', '/'],
    addSub: { min: 20, max: 500 }, tables: { min: 2, max: 12 }, factorMax: 12,
    fallTime: { start: 8, min: 5 }, maxOnScreen: 3,
  }),
});

export const LEVEL_IDS = Object.freeze(Object.keys(LEVELS));

/**
 * @param {string} id
 * @returns {Readonly<LevelConfig>}
 * @throws {GameError} Code 'UNKNOWN_LEVEL' for anything but easy, medium or hard.
 */
export function getLevel(id) {
  const level = LEVELS[id];
  if (!level) throw new GameError('UNKNOWN_LEVEL', `Unknown level "${id}"`, { id });
  return level;
}
