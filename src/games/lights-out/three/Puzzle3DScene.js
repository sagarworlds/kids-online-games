import { PuzzleScene } from '../scenes/PuzzleScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createBoardView } from '../ui/BoardView.js';
import { createBoardView3D } from './BoardView3D.js';

/**
 * The puzzle with a 3D board: a table at night with a jar for every cell, which the child can turn and zoom; flipped jars bounce and the
 * fireflies fly away when the puzzle is solved. It is the flat puzzle with two parts replaced (the board, and how the screen is laid out: the
 * picture on top on a phone, beside the buttons on a wide screen), so the puzzles, the taps, Undo, Restart, the hints, the stars and the saved
 * progress are the very same code in both views. The board is the same size at every level (3 x 3, 4 x 4, 5 x 5) and the rules are the flat game's.
 *
 * If 3D cannot start, or the graphics are lost, the picture goes and the flat grid of jars is the board again, as it was, so a puzzle is never
 * lost; the visit goes on flat and the 2D view is remembered for the next one (`routes.view.fallBack`).
 */
export class Puzzle3DScene extends PuzzleScene {
  createBoard({ size, onTap }) {
    // The flat grid is made first and is always in the page; the 3D board puts its buttons over the picture (or, if 3D stops, gives it back).
    const controls = createBoardView({ size, onTap, flights: false }); // the 3D board flies its own fireflies
    return createBoardView3D({ size, controls, onTap, onFallBack: () => this.routes.view.fallBack() });
  }

  layout({ board, overlay, status, controls, note }) {
    // The jar buttons are laid over the picture; the "solved" card goes in the panel, so the fireflies can be seen flying away above it.
    return el('main', { class: 'scene3d lights3d' }, board.el, el('div', { class: 'scene3d__panel' }, overlay, status, controls, note));
  }
}
