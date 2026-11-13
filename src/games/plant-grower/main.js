import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { openScreen } from '../../engine/three/openView.js';
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
     * Opens the garden in the child's chosen view (see `openScreen`). (If 3D cannot start inside the garden, the picture falls back in place; see `PlantStage3D`.)
     * @param {{ plantId: string, levelId: 'easy'|'medium'|'hard' }} choice
     */
    const play = (choice) => openScreen({
      view, scenes, where: 'plant-grower:3d', params: choice,
      load: () => import('./three/Garden3DScene.js'),
      make: ({ Garden3DScene }) => new Garden3DScene(services, routes, data),
      open2d: () => scenes.replace(new GardenScene(services, routes, data), choice),
    });

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
