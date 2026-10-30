import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { MenuScene } from './scenes/MenuScene.js';
import { CaseScene } from './scenes/CaseScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Pattern Detective: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'pattern-detective', title: 'Pattern Detective', root });
    const { scenes } = services;
    /** @type {import('./scenes/DetectiveScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play: (round) => scenes.replace(new CaseScene(services, routes), round),
      results: (round) => scenes.replace(new ResultScene(services, routes), round),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'pattern-detective:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
