import { isSolved, toggle } from './board.js';

/**
 * @typedef {{
 *   levelId: 'easy'|'medium'|'hard', board: boolean[][], initial: boolean[][], par: number,
 *   solutionTaps: [number, number][], moves: number, history: [number, number][], solved: boolean
 * }} PuzzleState
 */

/**
 * @param {import('./puzzleGenerator.js').Puzzle} puzzle
 * @param {'easy'|'medium'|'hard'} levelId
 * @returns {PuzzleState}
 */
export function newPuzzleState(puzzle, levelId) {
  return {
    levelId, board: puzzle.board, initial: puzzle.board, par: puzzle.par, solutionTaps: puzzle.solutionTaps,
    moves: 0, history: [], solved: false,
  };
}

/**
 * Taps a jar. A solved puzzle ignores further taps.
 * @param {PuzzleState} state
 * @param {number} r
 * @param {number} c
 * @returns {PuzzleState}
 */
export function tap(state, r, c) {
  if (state.solved) return state;
  const board = toggle(state.board, r, c);
  return { ...state, board, moves: state.moves + 1, history: [...state.history, [r, c]], solved: isSolved(board) };
}

/**
 * Undoes the last tap. Tapping a jar twice cancels out, so re-tapping it restores the *exact* previous board.
 *
 * Cost: on Easy, undo is free and takes the move back. On Medium and Hard the tap stays counted and the undo
 * counts as a move too, so careless tapping costs stars there.
 *
 * @param {PuzzleState} state
 * @returns {PuzzleState}
 */
export function undo(state) {
  if (state.solved || state.history.length === 0) return state;
  const [r, c] = state.history.at(-1);
  return {
    ...state,
    board: toggle(state.board, r, c),
    history: state.history.slice(0, -1),
    moves: state.levelId === 'easy' ? state.moves - 1 : state.moves + 1,
    solved: false,
  };
}

/**
 * Puts the puzzle back as it started. Free on Easy (the move counter resets); on Medium and Hard it keeps the
 * moves already made and adds one.
 * @param {PuzzleState} state
 * @returns {PuzzleState}
 */
export function restart(state) {
  if (state.solved) return state;
  return { ...state, board: state.initial, history: [], moves: state.levelId === 'easy' ? 0 : state.moves + 1 };
}
