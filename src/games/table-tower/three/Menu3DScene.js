import { MenuScene } from '../scenes/MenuScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { LEVELS, floorsOf, isFloorOpen } from '../logic/levels.js';
import { floorStates } from '../logic/tower3d.js';
import { createTowerView3D } from './TowerView3D.js';

/**
 * The menu with a 3D tower: a tower that grows a floor for each times table cleared, with the camera climbing to the floor being
 * worked on, which the child can turn, zoom and tap to open. The level picker, Revision, the list of floors and all the rules are the
 * 2D menu's (this is that scene with a 3D picture added), so the same play opens the same floors and earns the same stars.
 *
 * If 3D cannot start, `createTowerView3D` throws out of `enter()` and `main.js` opens the 2D menu instead. If the graphics are lost,
 * the 2D menu opens.
 */
export class Menu3DScene extends MenuScene {
  #tower = null;
  #note = el('p', { class: 'menu__note', attrs: { role: 'status' } });
  /** The level being shown and the floors cleared: the menu reports these before the picture exists, so they are kept. */
  #shown = null;

  layout({ title, intro, picker, view, revision, heading, tower }) {
    this.#tower = createTowerView3D({ onFloor: (floor) => this.#onFloor(floor), onContextLost: () => this.routes.fallBack.menu() });
    const buttons = el('div', { class: 'menu__tools3d', attrs: { role: 'group', 'aria-label': 'Tower view' } },
      createButton({ label: 'Current floor', icon: '🧗', onClick: () => this.#tower.climb() }),
      createButton({ label: 'Whole tower', icon: '🗼', onClick: () => this.#tower.showWholeTower() }));
    const panel = el('div', { class: 'scene3d__panel' }, title, intro, picker, view, this.#note, buttons, revision, heading, tower);
    if (this.#shown) this.#applyLevel();
    return el('div', { class: 'scene3d menu3d' }, this.#tower.el, panel);
  }

  levelDrawn(levelId, cleared) {
    this.#shown = { levelId, cleared };
    if (this.#tower) this.#applyLevel();
  }

  /** Builds the picture's floors from the level being shown. */
  #applyLevel() {
    const { levelId, cleared } = this.#shown;
    const floors = floorsOf(LEVELS[levelId]);
    this.#note.textContent = '';
    this.#tower.setLevel({ floors, states: floorStates({ floors, cleared, isOpen: (floor) => isFloorOpen(floor, cleared) }) });
  }

  /** A tap on a floor in the picture: open it like its button in the list, or say why it cannot be opened. */
  #onFloor(floor) {
    const { cleared } = this.#shown;
    if (!isFloorOpen(floor, cleared)) {
      this.#note.textContent = `Floor ${floor} is locked. Clear floor ${floor - 1} first.`;
      return;
    }
    this.services.audio.play('click');
    this.routes.floor(floor);
  }

  update(dt) {
    this.#tower?.update(dt);
  }

  render() {
    this.#tower?.render();
  }

  exit() {
    this.#tower?.dispose();
    this.#tower = null;
  }
}
