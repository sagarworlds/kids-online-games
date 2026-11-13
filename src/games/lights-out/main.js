import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
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
     * Opens a puzzle in the child's chosen view (see `openScreen`). (If 3D cannot start inside the puzzle, the grid becomes the board again; see `BoardView3D`.)
     * @param {import('./scenes/LightsScene.js').Round} round
     */
    const play = (round) => openScreen({
      view, scenes, where: 'lights-out:3d', params: round,
      load: () => import('./three/Puzzle3DScene.js'),
      make: ({ Puzzle3DScene }) => new Puzzle3DScene(services, routes),
      open2d: () => scenes.replace(new PuzzleScene(services, routes), round),
    });

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
