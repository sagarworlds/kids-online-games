import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateSentences } from './logic/sentences.js';
import { MenuScene } from './scenes/MenuScene.js';
import { StationScene } from './scenes/StationScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Sentence Train: services, validated sentences, and the scenes wired through `routes`. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'sentence-train', title: 'Sentence Train', root });
    const { scenes } = services;
    // A malformed sentences.json names the file and field in the log and shows the friendly error screen.
    const data = await loadJson(new URL('./data/sentences.json', import.meta.url), 'sentences.json', validateSentences);

    /** @type {import('./scenes/TrainScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play: (round) => scenes.replace(new StationScene(services, routes, data), round),
      results: (round) => scenes.replace(new ResultScene(services, routes, data), round),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'sentence-train:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
