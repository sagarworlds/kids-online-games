import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { logError } from '../../engine/utils/errors.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
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

    /** @type {import('./scenes/RobotScene.js').Routes} */
    const routes = {
      map: () => scenes.replace(new MapScene(services, routes, data)),
      puzzle: (params) => scenes.replace(new PuzzleScene(services, routes, data), params),
      complete: (params) => scenes.replace(new CompleteScene(services, routes, data), params),
    };

    routes.map();
    game.start();
  } catch (error) {
    logError(error, 'robot-path:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
