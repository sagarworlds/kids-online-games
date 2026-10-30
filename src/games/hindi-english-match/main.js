import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validatePairs } from './logic/pairs.js';
import { MenuScene } from './scenes/MenuScene.js';
import { BoardScene } from './scenes/BoardScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Hindi–English Match: services, validated vocabulary, and the scenes wired via `routes`. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'hindi-english-match', title: 'Hindi–English Match', root });
    const { scenes } = services;
    // A malformed pairs.json names the file and field in the log and shows the friendly error screen.
    const data = await loadJson(new URL('./data/pairs.json', import.meta.url), 'pairs.json', validatePairs);

    /** @type {import('./scenes/HindiScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play: (params) => scenes.replace(new BoardScene(services, routes, data), params),
      results: (params) => scenes.replace(new ResultScene(services, routes, data), params),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'hindi-english-match:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
