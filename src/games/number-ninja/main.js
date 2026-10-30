import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/**
 * Composition root for Number Ninja: creates the services (via createApp) and
 * wires the scenes together. Scenes get a `routes` object instead of importing
 * each other, so the dependency graph has no cycles.
 */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'number-ninja', title: 'Number Ninja', root, canvas: true });
    const { scenes } = services;

    /** @type {import('./scenes/NinjaScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play: (params) => scenes.replace(new PlayScene(services, routes), params),
      results: (params) => scenes.replace(new ResultScene(services, routes), params),
    };

    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'number-ninja:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
