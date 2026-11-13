import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
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
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    /**
     * Opens a round in the child's chosen view (see `openScreen`). (If 3D cannot start inside the round, the flat sky is drawn instead; see `Play3DScene`.)
     * @param {{ levelId: 'easy'|'medium'|'hard', ops: string[] }} params
     */
    const play = (params) => openScreen({
      view, scenes, where: 'number-ninja:3d', params,
      load: () => import('./three/Play3DScene.js'),
      make: ({ Play3DScene }) => new Play3DScene(services, routes),
      open2d: () => scenes.replace(new PlayScene(services, routes), params),
    });

    /** @type {import('./scenes/NinjaScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play,
      results: (params) => scenes.replace(new ResultScene(services, routes), params),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };

    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'number-ninja:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
