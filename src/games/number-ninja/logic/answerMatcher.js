/** @typedef {{ answer: number, y: number }} Targetable */

/**
 * Finds the star a typed answer should hit: the lowest one (closest to the
 * ground) whose answer matches. Clearing the most urgent star first is what a
 * child expects when two stars share an answer.
 *
 * @template {Targetable} T
 * @param {readonly T[]} problems Stars currently falling (y grows downward).
 * @param {number} value The number the child typed.
 * @returns {T|null} The matching star, or null if none matches.
 */
export function findTarget(problems, value) {
  let best = null;
  for (const problem of problems) {
    if (problem.answer === value && (best === null || problem.y > best.y)) best = problem;
  }
  return best;
}

/**
 * The star closest to the ground, used to aim hints at the most urgent problem.
 * @template {{ y: number }} T
 * @param {readonly T[]} problems
 * @returns {T|null}
 */
export function findLowest(problems) {
  let best = null;
  for (const problem of problems) {
    if (best === null || problem.y > best.y) best = problem;
  }
  return best;
}
