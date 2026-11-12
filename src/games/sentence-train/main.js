import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateSentences } from './logic/sentences.js';
import { createViewChoice } from '../../engine/three/view.js';
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
     * Opens a sentence in the child's chosen view. three.js is about 2 MB, so the 3D station is loaded with `import()` only when it is needed: the 2D game and the
     * home page never download it. If anything goes wrong on the way into 3D (the file will not load) it is logged and the flat station opens instead, so a child
     * never sees a blank screen for a view they did not need. (If 3D cannot start inside the station, the slots stay in their ordinary place; see `Station3DScene`.)
     * @param {import('./scenes/TrainScene.js').Round} round
     */
    const play = async (round) => {
      if (view.mode() === '3d') {
        try {
          const { Station3DScene } = await import('./three/Station3DScene.js');
          scenes.replace(new Station3DScene(services, routes, data), round);
          return;
        } catch (error) {
          logError(error, 'sentence-train:3d');
          view.fallBack();
        }
      }
      scenes.replace(new StationScene(services, routes, data), round);
    };

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
