import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PuzzleScene } from './scenes/PuzzleScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Lights Out: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'lights-out', title: 'Lights Out', root });
    const { scenes } = services;
    /** @type {import('./scenes/LightsScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play: (round) => scenes.replace(new PuzzleScene(services, routes), round),
      results: (round) => scenes.replace(new ResultScene(services, routes), round),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'lights-out:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
