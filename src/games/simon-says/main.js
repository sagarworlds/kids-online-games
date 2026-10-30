import { createApp } from '../../app/createApp.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
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

    // New sounds are added by registering them, so the engine's AudioService never needs to change.
    audio.registerSound('arpeggio', [261.63, 329.63, 392.0, 523.25].map((f) => ({ f, ms: 90 })));
    audio.registerSound('hmm', [{ f: 220, ms: 160, type: 'triangle', volume: 0.12 }, { f: 185, ms: 240, type: 'triangle', volume: 0.12 }]);

    /** @type {import('./scenes/SimonScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes)),
      play: (params) => scenes.replace(new PlayScene(services, routes), params),
      music: (params) => scenes.replace(new MusicScene(services, routes), params),
      results: (params) => scenes.replace(new ResultScene(services, routes), params),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'simon-says:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
