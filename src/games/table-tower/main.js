import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
import { MenuScene } from './scenes/MenuScene.js';
import { FloorScene } from './scenes/FloorScene.js';
import { LearnScene } from './scenes/LearnScene.js';
import { LadderScene } from './scenes/LadderScene.js';
import { QuizScene } from './scenes/QuizScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/**
 * Composition root for Table Tower: the services, and the scenes wired together through a `routes` object so that no scene
 * imports another. The tables are calculated, so there is no data file to load.
 */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'table-tower', title: 'Table Tower', root });
    const { scenes } = services;
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });
    const menu2d = () => scenes.replace(new MenuScene(services, routes));
    const learn2d = (floor) => scenes.replace(new LearnScene(services, routes), { floor });

    /**
     * Opens a screen in the child's chosen view (see `openScreen`).
     * @param {() => Promise<object>} load Imports the 3D scene's module.
     * @param {(module: object) => import('../../engine/Scene.js').Scene} make Builds the 3D scene from the module.
     * @param {Record<string, unknown>|undefined} params What the scene is opened with.
     * @param {() => void} open2d Opens the 2D version.
     */
    const open = (load, make, params, open2d) => openScreen({ view, scenes, where: 'table-tower:3d', load, make, params, open2d });

    /** @type {import('./scenes/TowerBase.js').Routes} */
    const routes = {
      menu: () => open(() => import('./three/Menu3DScene.js'), (m) => new m.Menu3DScene(services, routes), undefined, menu2d),
      floor: (floor) => scenes.replace(new FloorScene(services, routes), { floor }),
      learn: (floor) => open(() => import('./three/Learn3DScene.js'), (m) => new m.Learn3DScene(services, routes), { floor }, () => learn2d(floor)),
      ladder: (floor) => scenes.replace(new LadderScene(services, routes), { floor }),
      quiz: (choice) => scenes.replace(new QuizScene(services, routes), choice),
      results: (result) => scenes.replace(new ResultScene(services, routes), result),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
      fallBack: { menu: () => { view.fallBack(); menu2d(); } },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'table-tower:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
