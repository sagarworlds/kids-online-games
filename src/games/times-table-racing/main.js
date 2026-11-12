import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { MenuScene } from './scenes/MenuScene.js';
import { RaceScene } from './scenes/RaceScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Times-Table Racing: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'times-table-racing', title: 'Times-Table Racing', root, canvas: true });
    const { scenes } = services;
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    /**
     * Opens a race in the child's chosen view. three.js is about 2 MB, so the 3D race is loaded with `import()` only when it
     * is needed: the 2D game and the home page never download it. If the 3D file will not load, that is logged and the 2D race
     * opens instead, so a child never sees a blank screen or an error for a view they did not need. (Trouble after the race
     * has started is handled inside the 3D race, which carries on with the 2D track.)
     */
    const play = async (setup) => {
      if (view.mode() === '3d') {
        try {
          const { Race3DScene } = await import('./three/Race3DScene.js');
          scenes.replace(new Race3DScene(services, routes), setup);
          return;
        } catch (error) {
          logError(error, 'times-table-racing:3d');
          view.fallBack();
        }
      }
      scenes.replace(new RaceScene(services, routes), setup);
    };

    /** @type {import('./scenes/RacingScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play,
      results: (outcome) => scenes.replace(new ResultScene(services, routes), outcome),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'times-table-racing:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
