import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PuzzleScene } from './scenes/PuzzleScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Lights Out: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'lights-out', title: 'Lights Out', root });
    const { scenes } = services;
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    /**
     * Opens a puzzle in the child's chosen view. three.js is about 2 MB, so the 3D puzzle is loaded with `import()` only when it is needed: the 2D
     * game and the home page never download it. If anything goes wrong on the way into 3D (the file will not load, the scene fails to start) it is
     * logged and the flat puzzle opens instead, so a child never sees a blank screen for a view they did not need. (If 3D cannot start inside the
     * puzzle, the grid becomes the board again; see `BoardView3D`.)
     * @param {import('./scenes/LightsScene.js').Round} round
     */
    const play = async (round) => {
      if (view.mode() === '3d') {
        try {
          const { Puzzle3DScene } = await import('./three/Puzzle3DScene.js');
          scenes.replace(new Puzzle3DScene(services, routes), round);
          return;
        } catch (error) {
          logError(error, 'lights-out:3d');
          view.fallBack();
        }
      }
      scenes.replace(new PuzzleScene(services, routes), round);
    };

    /** @type {import('./scenes/LightsScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play,
      results: (round) => scenes.replace(new ResultScene(services, routes), round),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'lights-out:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
