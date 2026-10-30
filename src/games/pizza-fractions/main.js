import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { MenuScene } from './scenes/MenuScene.js';
import { KitchenScene } from './scenes/KitchenScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Pizza Fractions: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'pizza-fractions', title: 'Pizza Fractions', root });
    const { scenes } = services;
    /** @type {import('./scenes/PizzaScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play: (round) => scenes.replace(new KitchenScene(services, routes), round),
      results: (round) => scenes.replace(new ResultScene(services, routes), round),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'pizza-fractions:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
