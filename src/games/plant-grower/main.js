import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { validatePlants } from './logic/plants.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GardenScene } from './scenes/GardenScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** Composition root for Plant Grower: services, validated data, and the scenes wired through a `routes` object. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'plant-grower', title: 'Plant Grower', root });
    const { scenes } = services;
    // Malformed data names the file and field in the log and shows the friendly error screen.
    const plants = await loadJson(new URL('./data/plants.json', import.meta.url), 'plants.json', validatePlants);
    const data = { plants };
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });

    /**
     * Opens the garden in the child's chosen view. three.js is about 2 MB, so the 3D garden is loaded with `import()` only when it is
     * needed: the 2D game and the home page never download it. If anything goes wrong on the way into 3D (the file will not load, the
     * garden fails to start) it is logged and the flat garden opens instead, so a child never sees a blank screen for a view they did
     * not need. (If 3D cannot start inside the garden, the picture falls back in place; see `PlantStage3D`.)
     * @param {{ plantId: string, levelId: 'easy'|'medium'|'hard' }} choice
     */
    const play = async (choice) => {
      if (view.mode() === '3d') {
        try {
          const { Garden3DScene } = await import('./three/Garden3DScene.js');
          scenes.replace(new Garden3DScene(services, routes, data), choice);
          return;
        } catch (error) {
          logError(error, 'plant-grower:3d');
          view.fallBack();
        }
      }
      scenes.replace(new GardenScene(services, routes, data), choice);
    };

    /** @type {import('./scenes/PlantScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play,
      results: (result) => scenes.replace(new ResultScene(services, routes, data), result),
      view: { supported: view.supported, mode: view.mode, choose: view.choose, fallBack: view.fallBack },
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'plant-grower:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
