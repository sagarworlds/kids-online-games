import { LearnScene } from '../scenes/LearnScene.js';
import { createSplitGrid } from '../ui/SplitGrid.js';
import { logError } from '../../../engine/utils/errors.js';
import { createSlabStage } from './SlabView3D.js';

/**
 * Learn mode with the split sum shown as 3D slabs: the same cards, the same rows to choose and the same written working as the 2D
 * lesson, but the picture of "17 × 6 is 10 × 6 and 7 × 6" is a pair of slabs of squares the child can turn and look at.
 *
 * If 3D cannot start, or the graphics are lost part-way through a lesson, the lesson is not restarted: that card is simply drawn
 * flat again, from the same place, and stays flat for the rest of the visit.
 */
export class Learn3DScene extends LearnScene {
  #stage = null;
  #flat = false;

  createSplitGrid(table) {
    if (!this.#flat) {
      try {
        const grid = createSplitGrid({ table, createStage: () => {
          this.#stage = createSlabStage({ onContextLost: () => this.#giveUp3d('the graphics were lost') });
          return this.#stage;
        } });
        return grid;
      } catch (error) {
        logError(error, 'table-tower:3d');
        this.routes.view.fallBack(); // for this visit only
        this.#flat = true;
        this.#stage = null;
      }
    }
    return super.createSplitGrid(table);
  }

  releaseCard() {
    this.#stage?.dispose();
    this.#stage = null;
  }

  update(dt) {
    this.#stage?.update(dt);
  }

  render() {
    this.#stage?.render();
  }

  /** Drops the 3D picture and draws the card flat, in the middle of a lesson. */
  #giveUp3d(reason) {
    logError(new Error(`3D slabs stopped: ${reason}`), 'table-tower:3d');
    this.routes.view.fallBack();
    this.#flat = true;
    // `refreshCard` frees the 3D picture (through `releaseCard`) and draws the same card again, now flat.
    this.refreshCard();
  }
}
