import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { logError } from '../../engine/utils/errors.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { createViewChoice } from '../../engine/three/view.js';
import { parseLevels } from './logic/levels.js';
import { MapScene } from './scenes/MapScene.js';
import { PuzzleScene } from './scenes/PuzzleScene.js';
import { CompleteScene } from './scenes/CompleteScene.js';

/**
 * Composition root for Robot Path: creates the services, loads and validates
 * the level data, and wires the scenes together through a `routes` object so
 * they never import each other.
 */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'robot-path', title: 'Robot Path', root });
    const { scenes } = services;

    // A malformed levels.json throws a GameError naming the file and field, and ends up on the friendly error screen.
    const data = await loadJson(new URL('./data/levels.json', import.meta.url), 'levels.json', parseLevels);

    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });
    const puzzle2d = (params) => scenes.replace(new PuzzleScene(services, routes, data), params);
    /**
     * Opens a level in the child's chosen view. three.js is about 2 MB, so the 3D puzzle is loaded with `import()` only
     * when it is needed: the 2D game and the home page never download it. Anything that goes wrong on the way into 3D (the
     * file will not load, the device has no WebGL 2, the scene fails to start) is logged and the 2D puzzle opens instead,
     * so a child never sees a blank screen or an error for a view they did not need.
     */
    const puzzle = async (params) => {
      if (view.mode() === '3d') {
        try {
          const { Puzzle3DScene } = await import('./three/Puzzle3DScene.js');
          scenes.replace(new Puzzle3DScene(services, routes, data), params);
          return;
        } catch (error) {
          logError(error, 'robot-path:puzzle:3d');
          view.fallBack();
        }
      }
      puzzle2d(params);
    };

    /** @type {import('./scenes/RobotScene.js').Routes} */
    const routes = {
      map: () => scenes.replace(new MapScene(services, routes, data)),
      puzzle,
      complete: (params) => scenes.replace(new CompleteScene(services, routes, data), params),
      view: { supported: view.supported, mode: view.mode, choose: view.choose },
      fallBack: (params) => { view.fallBack(); puzzle2d(params); },
    };

    routes.map();
    game.start();
  } catch (error) {
    logError(error, 'robot-path:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
