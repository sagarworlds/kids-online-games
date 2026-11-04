import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateWords } from './logic/words.js';
import { validateManifest } from './logic/audio.js';
import { MenuScene } from './scenes/MenuScene.js';
import { LearnScene } from './scenes/LearnScene.js';
import { BuildScene } from './scenes/BuildScene.js';
import { BubbleScene } from './scenes/BubbleScene.js';
import { WordScene } from './scenes/WordScene.js';
import { ResultScene } from './scenes/ResultScene.js';

const RUN_SCENES = { build: BuildScene, bubbles: BubbleScene, words: WordScene };

/** Composition root for Matra Mixer: services, validated data, and the scenes wired through a `routes` object. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'matra-mixer', title: 'Matra Mixer', root });
    const { scenes } = services;
    // Malformed data names the file and field in the log and shows the friendly error screen.
    const [words, manifest] = await Promise.all([
      loadJson(new URL('./data/words.json', import.meta.url), 'words.json', validateWords),
      loadJson(new URL('./data/audio-manifest.json', import.meta.url), 'audio-manifest.json', validateManifest),
    ]);
    const data = { words, manifest };

    /** @type {import('./scenes/MatraBase.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      learn: () => scenes.replace(new LearnScene(services, routes, data)),
      run: ({ activity, levelId }) => scenes.replace(new RUN_SCENES[activity](services, routes, data), { levelId }),
      results: (result) => scenes.replace(new ResultScene(services, routes, data), result),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'matra-mixer:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
