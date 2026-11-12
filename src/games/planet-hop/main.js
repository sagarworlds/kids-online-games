import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
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

/**
 * The 3D version of each mode that has one (the quiz is questions with pictures, so it stays flat in both views).
 * Each is loaded with `import()` only when a child plays in 3D: three.js is about 2 MB, which the 2D game and the home
 * page must never download.
 */
const SCENES_3D = {
  lineup: async () => (await import('./three/Lineup3DScene.js')).Lineup3DScene,
  weigh: async () => (await import('./three/Weigh3DScene.js')).Weigh3DScene,
};

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
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    const play2d = ({ mode, levelId, resume }) => scenes.replace(new MODE_SCENES[mode](services, routes, data), { levelId, resume });
    /**
     * Opens a mode in the child's chosen view. Anything that goes wrong on the way into 3D (the file will not load,
     * the device has no WebGL 2, the scene fails to start) is logged and the 2D version opens instead, so a child never
     * sees a blank screen or an error for a view they did not need.
     */
    const play = async (choice) => {
      const load3d = SCENES_3D[choice.mode];
      if (load3d && view.mode() === '3d') {
        try {
          const Scene3D = await load3d();
          scenes.replace(new Scene3D(services, routes, data), { levelId: choice.levelId, resume: choice.resume });
          return;
        } catch (error) {
          logError(error, `planet-hop:${choice.mode}:3d`);
          view.fallBack();
        }
      }
      play2d(choice);
    };

    /** @type {import('./scenes/HopScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play,
      results: (result) => scenes.replace(new ResultScene(services, routes, data), result),
      view: { supported: view.supported, mode: view.mode, choose: view.choose },
      fallBack: (choice) => { view.fallBack(); play2d(choice); },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'planet-hop:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
