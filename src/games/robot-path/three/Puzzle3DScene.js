import { PuzzleScene } from '../scenes/PuzzleScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createViewToggle } from '../../../engine/three/ViewToggle.js';
import { createBoardView3D } from './BoardView3D.js';

/**
 * The Robot Path puzzle in 3D. It is the 2D puzzle scene with two parts replaced: the board becomes a 3D one the child can
 * turn and zoom (or watch from behind the robot), and the screen is laid out as the 3D rules ask (the picture on top on a
 * phone, beside the controls on a wide screen). The blocks, running, stepping, hints, stars and saved progress are the very
 * same code, so the same play earns the same stars in both views.
 *
 * If 3D cannot start, `createBoardView3D` throws 'WEBGL_UNAVAILABLE' out of `enter()`, and `main.js` opens the 2D puzzle
 * instead. If the graphics are lost mid-puzzle, the blocks built so far go with the child to the 2D puzzle.
 */
export class Puzzle3DScene extends PuzzleScene {
  #levelId = 0;
  #board3d = null;
  #robotViewButton = null;

  /** @param {{ levelId: number, resume?: { program: import('../logic/interpreter.js').Program } }} params */
  enter(params) {
    this.#levelId = params.levelId;
    super.enter(params);
  }

  createBoard(level) {
    this.#board3d = createBoardView3D({ level, onContextLost: () => this.#lost() });
    return this.#board3d;
  }

  layout({ boardEl, controls, status, tip, hint, editorEl }) {
    this.#robotViewButton = createButton({
      label: 'Robot’s view', icon: '🤖', className: 'toggle-btn',
      onClick: () => this.#toggleRobotView(),
    });
    this.#robotViewButton.setAttribute('aria-pressed', 'false');
    const tools = el('div', { class: 'tools3d', attrs: { role: 'group', 'aria-label': 'Camera' } },
      this.#robotViewButton,
      createButton({ label: 'Whole board', icon: '🔭', onClick: () => this.#showWholeBoard() }),
      createViewToggle({ mode: '3d', onChange: (next) => this.#switchView(next) }));
    // The run buttons stay at the top of the panel while the blocks below scroll, so Run is always one tap away.
    return el('main', { class: 'scene3d puzzle3d' }, boardEl,
      el('div', { class: 'scene3d__panel' }, controls, status, tools, tip, hint, editorEl));
  }

  #toggleRobotView() {
    const next = this.#board3d.cameraMode === 'robot' ? 'map' : 'robot';
    this.#board3d.setCameraMode(next);
    this.#robotViewButton.setAttribute('aria-pressed', String(next === 'robot'));
  }

  #showWholeBoard() {
    this.#board3d.showWholeBoard();
    this.#robotViewButton.setAttribute('aria-pressed', 'false');
  }

  /** The blocks go with the child to the other view, so a puzzle half built is not lost. */
  #resume() {
    return { program: this.currentProgram() };
  }

  #switchView(next) {
    this.routes.view.choose(next);
    this.routes.puzzle({ levelId: this.#levelId, resume: this.#resume() });
  }

  /** The graphics were lost (a phone reclaimed the GPU): carry on in 2D, with no error screen. */
  #lost() {
    this.routes.fallBack({ levelId: this.#levelId, resume: this.#resume() });
  }
}
