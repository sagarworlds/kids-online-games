import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
import { MenuScene } from './scenes/MenuScene.js';
import { CaseScene } from './scenes/CaseScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Pattern Detective: creates the services and wires the scenes through a `routes` object. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'pattern-detective', title: 'Pattern Detective', root });
    const { scenes } = services;
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    /**
     * Opens a case in the child's chosen view (see `openScreen`). (If 3D cannot start inside the case, the flat strip is shown instead of the picture; see `CaseView3D`.)
     * @param {import('./scenes/DetectiveScene.js').Round} round
     */
    const play = (round) => openScreen({
      view, scenes, where: 'pattern-detective:3d', params: round,
      load: () => import('./three/Case3DScene.js'),
      make: ({ Case3DScene }) => new Case3DScene(services, routes),
      open2d: () => scenes.replace(new CaseScene(services, routes), round),
    });

    /** @type {import('./scenes/DetectiveScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play,
      results: (round) => scenes.replace(new ResultScene(services, routes), round),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'pattern-detective:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
