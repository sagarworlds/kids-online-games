import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateSentences } from './logic/sentences.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
import { MenuScene } from './scenes/MenuScene.js';
import { StationScene } from './scenes/StationScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Sentence Train: services, validated sentences, and the scenes wired through `routes`. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'sentence-train', title: 'Sentence Train', root });
    const { scenes } = services;
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });
    // A malformed sentences.json names the file and field in the log and shows the friendly error screen.
    const data = await loadJson(new URL('./data/sentences.json', import.meta.url), 'sentences.json', validateSentences);

    /**
     * Opens a sentence in the child's chosen view (see `openScreen`). (If 3D cannot start inside the station, the slots stay in their ordinary place; see `Station3DScene`.)
     * @param {import('./scenes/TrainScene.js').Round} round
     */
    const play = (round) => openScreen({
      view, scenes, where: 'sentence-train:3d', params: round,
      load: () => import('./three/Station3DScene.js'),
      make: ({ Station3DScene }) => new Station3DScene(services, routes, data),
      open2d: () => scenes.replace(new StationScene(services, routes, data), round),
    });

    /** @type {import('./scenes/TrainScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play,
      results: (round) => scenes.replace(new ResultScene(services, routes, data), round),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'sentence-train:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
