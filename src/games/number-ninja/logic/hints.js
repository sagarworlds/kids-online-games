import { OP_SYMBOL } from './levels.js';

/** @typedef {{ a: number, b: number, op: import('./levels.js').Op, answer: number }} ProblemLike */

/**
 * A short strategy hint shown after two wrong tries. It teaches a method
 * instead of giving the answer away.
 * @param {ProblemLike} p
 * @returns {string}
 */
export function hintFor({ a, b, op }) {
  switch (op) {
    case '+':
      return `Start at ${a} and count up ${b}.`;
    case '-':
      return `Start at ${a} and count back ${b}.`;
    case 'x':
      return `Think of ${a} groups of ${b}. Try adding ${b} again and again.`;
    case '/':
      return `How many ${b}s fit into ${a}? Think: ${b} × ? = ${a}.`;
    default:
      return 'Take your time and try again.';
  }
}

const SPOKEN_OP = Object.freeze({ '+': 'plus', '-': 'minus', x: 'times', '/': 'divided by' });

/**
 * The problem as a sentence for read-aloud ("7 times 8").
 * @param {ProblemLike} p
 * @returns {string}
 */
export function problemToSpeech({ a, b, op }) {
  return `${a} ${SPOKEN_OP[op]} ${b}`;
}

/**
 * The problem as shown on screen ("7 × 8").
 * @param {ProblemLike} p
 * @returns {string}
 */
export function problemToText({ a, b, op }) {
  return `${a} ${OP_SYMBOL[op]} ${b}`;
}
