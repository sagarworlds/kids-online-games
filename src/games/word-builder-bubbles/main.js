import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateWords } from './logic/words.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Word Builder Bubbles: services, validated word packs, and the scenes wired through `routes`. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'word-builder-bubbles', title: 'Word Builder Bubbles', root, canvas: true });
    const { scenes } = services;
    // A malformed words.json names the file and field in the log and shows the friendly error screen.
    const data = await loadJson(new URL('./data/words.json', import.meta.url), 'words.json', validateWords);

    /** @type {import('./scenes/BubblesScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play: (round) => scenes.replace(new PlayScene(services, routes, data), round),
      results: (round) => scenes.replace(new ResultScene(services, routes, data), round),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'word-builder-bubbles:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
