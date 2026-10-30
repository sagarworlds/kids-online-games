/**
 * @typedef {{ reachedGoal: boolean, blocks: number, par: number, collected: number, totalGems: number }} RunResult
 * @typedef {{ id: 'goal'|'par'|'gems', met: boolean, applicable: boolean }} Criterion
 */

/**
 * The three things a level can ask for, so the results screen can show which
 * ones were met instead of just a number.
 *
 * "Collect all gems" is automatically met on levels that have no gems
 * (Worlds 1 and 2), so those levels give 2 stars for solving and 3 for solving
 * within par. The spec only introduces gems in World 3.
 *
 * @param {RunResult} result
 * @returns {Criterion[]}
 */
export function criteriaFor({ reachedGoal, blocks, par, collected, totalGems }) {
  return [
    { id: 'goal', met: reachedGoal, applicable: true },
    { id: 'par', met: reachedGoal && blocks <= par, applicable: true },
    { id: 'gems', met: reachedGoal && collected === totalGems, applicable: totalGems > 0 },
  ];
}

/**
 * Stars for one level: reached the goal = 1, used at most `par` blocks = +1, all gems = +1.
 * A run that does not reach the goal earns none (and is not a finished level).
 * @param {RunResult} result
 * @returns {0|1|2|3}
 */
export function starsFor(result) {
  if (!result.reachedGoal) return 0;
  return /** @type {1|2|3} */ (criteriaFor(result).filter((c) => c.met).length);
}
