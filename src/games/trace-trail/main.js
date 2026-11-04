import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { MenuScene } from './scenes/MenuScene.js';
import { TraceScene } from './scenes/TraceScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { WorksheetScene } from './scenes/WorksheetScene.js';

/**
 * Composition root for Trace Trail: the services, and the scenes wired together through a `routes` object so that no scene
 * imports another. The letter shapes are part of the code, so there is no data file to load.
 */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'trace-trail', title: 'Trace Trail', root });
    const { scenes } = services;

    /** @type {import('./scenes/TraceBase.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      trace: (choice) => scenes.replace(new TraceScene(services, routes), choice),
      worksheet: (setId) => scenes.replace(new WorksheetScene(services, routes), { setId }),
      results: (result) => scenes.replace(new ResultScene(services, routes), result),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'trace-trail:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
