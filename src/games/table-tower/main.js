import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
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

    /** @type {import('./scenes/TowerBase.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      floor: (floor) => scenes.replace(new FloorScene(services, routes), { floor }),
      learn: (floor) => scenes.replace(new LearnScene(services, routes), { floor }),
      ladder: (floor) => scenes.replace(new LadderScene(services, routes), { floor }),
      quiz: (choice) => scenes.replace(new QuizScene(services, routes), choice),
      results: (result) => scenes.replace(new ResultScene(services, routes), result),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'table-tower:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
