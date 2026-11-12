import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { MusicScene } from './scenes/MusicScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Simon Says: creates the services, adds this game's sounds, and wires scenes via `routes`. */
function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'simon-says', title: 'Simon Says', root });
    const { scenes, audio } = services;
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    /**
     * Opens a game screen in the child's chosen view. three.js is about 2 MB, so a 3D scene is loaded with `import()` only when it is needed: the 2D game and
     * the home page never download it. If anything goes wrong on the way into 3D (the file will not load) it is logged and the flat screen opens instead,
     * so a child never sees a blank screen for a view they did not need. (If 3D cannot start inside the screen, the flat pads are used instead; see
     * `PadBoard3D`.)
     * @param {() => Promise<object>} load Imports the 3D scene's module.
     * @param {(module: object) => import('../../engine/Scene.js').Scene} make Builds the 3D scene from the module.
     * @param {object} params What the scene is opened with.
     * @param {() => void} fallBack Opens the 2D screen.
     */
    const open = async (load, make, params, fallBack) => {
      if (view.mode() === '3d') {
        try {
          const module = await load();
          scenes.replace(make(module), params);
          return;
        } catch (error) {
          logError(error, 'simon-says:3d');
          view.fallBack();
        }
      }
      fallBack();
    };

    // New sounds are added by registering them, so the engine's AudioService never needs to change.
    audio.registerSound('arpeggio', [261.63, 329.63, 392.0, 523.25].map((f) => ({ f, ms: 90 })));
    audio.registerSound('hmm', [{ f: 220, ms: 160, type: 'triangle', volume: 0.12 }, { f: 185, ms: 240, type: 'triangle', volume: 0.12 }]);

    /** @type {import('./scenes/SimonScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play: (params) => open(() => import('./three/Play3DScene.js'), (m) => new m.Play3DScene(services, routes), params, () => scenes.replace(new PlayScene(services, routes), params)),
      music: (params) => open(() => import('./three/Music3DScene.js'), (m) => new m.Music3DScene(services, routes), params, () => scenes.replace(new MusicScene(services, routes), params)),
      results: (params) => scenes.replace(new ResultScene(services, routes), params),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'simon-says:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
