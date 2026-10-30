import { solve } from './solver.js';

/**
 * A jar worth tapping next, or null if the puzzle is solved.
 *
 * Easy uses the taps recorded when the puzzle was made, minus the ones already done. Two taps on the same jar
 * cancel, so "taps still needed" is the XOR (symmetric difference) of the recorded taps and the taps made so far.
 * Medium and Hard solve the board as it is now with the GF(2) solver, so a hint stays right even after mistakes.
 *
 * @param {import('./puzzleState.js').PuzzleState} state
 * @returns {[number, number]|null}
 */
export function hintTap(state) {
  if (state.solved) return null;
  if (state.levelId === 'easy') {
    const parity = new Map();
    for (const [r, c] of [...state.solutionTaps, ...state.history]) {
      const key = `${r},${c}`;
      parity.set(key, !parity.get(key));
    }
    const first = [...parity].find(([, needed]) => needed);
    return first ? first[0].split(',').map(Number) : null;
  }
  return solve(state.board)?.[0] ?? null;
}
