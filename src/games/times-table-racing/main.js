import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
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
     * Opens a race in the child's chosen view (see `openScreen`).
     */
    const play = (setup) => openScreen({
      view, scenes, where: 'times-table-racing:3d', params: setup,
      load: () => import('./three/Race3DScene.js'),
      make: ({ Race3DScene }) => new Race3DScene(services, routes),
      open2d: () => scenes.replace(new RaceScene(services, routes), setup),
    });

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
