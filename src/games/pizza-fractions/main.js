import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
import { MenuScene } from './scenes/MenuScene.js';
import { KitchenScene } from './scenes/KitchenScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Pizza Fractions: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'pizza-fractions', title: 'Pizza Fractions', root });
    const { scenes } = services;
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    /**
     * Opens a customer in the child's chosen view (see `openScreen`). (If 3D cannot start inside the kitchen, the pizza falls back in place; see `PizzaView3D`.)
     * @param {import('./scenes/PizzaScene.js').Round} round
     */
    const play = (round) => openScreen({
      view, scenes, where: 'pizza-fractions:3d', params: round,
      load: () => import('./three/Kitchen3DScene.js'),
      make: ({ Kitchen3DScene }) => new Kitchen3DScene(services, routes),
      open2d: () => scenes.replace(new KitchenScene(services, routes), round),
    });

    /** @type {import('./scenes/PizzaScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play,
      results: (round) => scenes.replace(new ResultScene(services, routes), round),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'pizza-fractions:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
