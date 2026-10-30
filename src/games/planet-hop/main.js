import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validatePlanets, weighStops } from './logic/planets.js';
import { validateQuiz } from './logic/quiz.js';
import { validatePresets } from './logic/presets.js';
import { MenuScene } from './scenes/MenuScene.js';
import { LineupScene } from './scenes/LineupScene.js';
import { WeighScene } from './scenes/WeighScene.js';
import { QuizScene } from './scenes/QuizScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** One scene for each way to play, so adding a mode means adding a scene and a line here. */
const MODE_SCENES = { lineup: LineupScene, weigh: WeighScene, quiz: QuizScene };

/** Composition root for Planet Hop: services, validated data, and the scenes wired through a `routes` object. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'planet-hop', title: 'Planet Hop', root });
    const { scenes, audio } = services;
    // Malformed data names the file and field in the log and shows the friendly error screen.
    const planetData = await loadJson(new URL('./data/planets.json', import.meta.url), 'planets.json', validatePlanets);
    const [quiz, presets] = await Promise.all([
      loadJson(new URL('./data/quiz.json', import.meta.url), 'quiz.json', (raw) => validateQuiz(raw, planetData.planets)),
      loadJson(new URL('./data/presets.json', import.meta.url), 'presets.json', validatePresets),
    ]);
    audio.registerSound('whoosh', [{ f: 220, ms: 50, type: 'sawtooth', volume: 0.12 }, { f: 440, ms: 60, type: 'sawtooth', volume: 0.12 }, { f: 880, ms: 90, type: 'sawtooth', volume: 0.1 }]);

    const data = { ...planetData, stops: weighStops(planetData), quiz, presets };
    /** @type {import('./scenes/HopScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play: ({ mode, levelId }) => scenes.replace(new MODE_SCENES[mode](services, routes, data), { levelId }),
      results: (result) => scenes.replace(new ResultScene(services, routes, data), result),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'planet-hop:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
