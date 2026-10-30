import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { MenuScene } from './scenes/MenuScene.js';
import { RaceScene } from './scenes/RaceScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Times-Table Racing: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'times-table-racing', title: 'Times-Table Racing', root, canvas: true });
    const { scenes } = services;
    /** @type {import('./scenes/RacingScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play: (setup) => scenes.replace(new RaceScene(services, routes), setup),
      results: (outcome) => scenes.replace(new ResultScene(services, routes), outcome),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'times-table-racing:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
