import { GameError } from '../../../engine/utils/errors.js';
import { pick, randInt } from '../../../engine/utils/random.js';
import { getLevel } from './levels.js';

/** @typedef {import('./levels.js').Op} Op */
/** @typedef {{ a: number, b: number, op: Op, answer: number }} BaseProblem */

/** How many fresh tries to make before accepting a repeat (only matters for tiny problem spaces). */
const MAX_ATTEMPTS = 25;

/** Each builder returns a problem whose operands and answer are all whole and non-negative. */
const BUILDERS = {
  '+': ({ addSub: { min, max } }, rng) => {
    const a = randInt(rng, min, max - min); // leaves room for b >= min
    const b = randInt(rng, min, max - a);
    return { a, b, op: '+', answer: a + b };
  },
  '-': ({ addSub: { min, max } }, rng) => {
    const a = randInt(rng, min, max);
    const b = randInt(rng, min, a); // b <= a, so the answer is never negative
    return { a, b, op: '-', answer: a - b };
  },
  x: ({ tables, factorMax }, rng) => {
    const table = randInt(rng, tables.min, tables.max);
    const factor = randInt(rng, 2, factorMax);
    // Show the table number first or second at random so 3 x 7 and 7 x 3 both appear.
    return rng() < 0.5
      ? { a: table, b: factor, op: 'x', answer: table * factor }
      : { a: factor, b: table, op: 'x', answer: table * factor };
  },
  '/': ({ tables, factorMax }, rng) => {
    // Build the dividend from divisor x quotient so division is always exact.
    const divisor = randInt(rng, tables.min, tables.max);
    const quotient = randInt(rng, 2, factorMax);
    return { a: divisor * quotient, b: divisor, op: '/', answer: quotient };
  },
};

/**
 * Identity of a problem for the "no repeat within 5 spawns" rule.
 * @param {{ a: number, b: number, op: Op }} problem
 * @returns {string}
 */
export function problemKey({ a, b, op }) {
  return `${a}${op}${b}`;
}

/**
 * Generates one problem for a level.
 *
 * @param {'easy'|'medium'|'hard'} levelId
 * @param {readonly Op[]} ops Operations the child picked; any not available at this level are ignored.
 * @param {() => number} rng Random source (injected so tests are deterministic).
 * @param {readonly string[]} [recent] Keys of the last few spawned problems (see {@link problemKey});
 *   a problem with one of these keys is avoided.
 * @returns {BaseProblem}
 * @throws {GameError} 'UNKNOWN_LEVEL', or 'NO_OPERATIONS' if none of `ops` exist at this level.
 */
export function generateProblem(levelId, ops, rng, recent = []) {
  const level = getLevel(levelId);
  const allowed = level.ops.filter((op) => ops.includes(op));
  if (allowed.length === 0) {
    throw new GameError('NO_OPERATIONS', `None of [${ops}] are available on ${levelId}`, { levelId, ops: [...ops] });
  }

  let problem;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    problem = BUILDERS[pick(rng, allowed)](level, rng);
    if (!recent.includes(problemKey(problem))) return problem;
  }
  return problem; // The space is too small to avoid a repeat; better a repeat than a stall.
}
