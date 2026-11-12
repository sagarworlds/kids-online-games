import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
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
     * Opens a customer in the child's chosen view. three.js is about 2 MB, so the 3D kitchen is loaded with `import()` only when it is needed:
     * the 2D game and the home page never download it. If anything goes wrong on the way into 3D (the file will not load, the scene fails to
     * start) it is logged and the flat kitchen opens instead, so a child never sees a blank screen for a view they did not need. (If 3D cannot
     * start inside the kitchen, the pizza falls back in place; see `PizzaView3D`.)
     * @param {import('./scenes/PizzaScene.js').Round} round
     */
    const play = async (round) => {
      if (view.mode() === '3d') {
        try {
          const { Kitchen3DScene } = await import('./three/Kitchen3DScene.js');
          scenes.replace(new Kitchen3DScene(services, routes), round);
          return;
        } catch (error) {
          logError(error, 'pizza-fractions:3d');
          view.fallBack();
        }
      }
      scenes.replace(new KitchenScene(services, routes), round);
    };

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
