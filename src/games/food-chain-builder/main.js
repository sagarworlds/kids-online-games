import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateOrganisms, byId } from './logic/organisms.js';
import { validateHabitats } from './logic/habitats.js';
import { MenuScene } from './scenes/MenuScene.js';
import { BuilderScene } from './scenes/BuilderScene.js';
import { WhatIfScene } from './scenes/WhatIfScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** A short sound for each habitat, played when its food web comes alive (made from tones, so no sound files). */
const AMBIENT = Object.freeze({
  forest: [{ f: 1400, ms: 70, type: 'sine', volume: 0.15 }, { f: 1800, ms: 70, type: 'sine', volume: 0.15 }, { f: 1500, ms: 60, type: 'sine', volume: 0.15 }, { f: 2000, ms: 120, type: 'sine', volume: 0.15 }],
  ocean: [{ f: 140, ms: 300, type: 'sine', volume: 0.22 }, { f: 110, ms: 400, type: 'sine', volume: 0.22 }, { f: 130, ms: 300, type: 'sine', volume: 0.2 }],
  pond: [{ f: 900, ms: 60, type: 'sine', volume: 0.18 }, { f: 600, ms: 90, type: 'sine', volume: 0.18 }, { f: 1000, ms: 60, type: 'sine', volume: 0.18 }, { f: 650, ms: 100, type: 'sine', volume: 0.18 }],
  grassland: [{ f: 3000, ms: 40, type: 'square', volume: 0.05 }, { f: 3400, ms: 40, type: 'square', volume: 0.05 }, { f: 3000, ms: 40, type: 'square', volume: 0.05 }, { f: 3400, ms: 40, type: 'square', volume: 0.05 }, { f: 3000, ms: 40, type: 'square', volume: 0.05 }],
  desert: [{ f: 200, ms: 250, type: 'triangle', volume: 0.14 }, { f: 260, ms: 300, type: 'triangle', volume: 0.14 }, { f: 180, ms: 350, type: 'triangle', volume: 0.14 }],
});

/** Composition root for Food Chain Builder: services, validated data, and the scenes wired through a `routes` object. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'food-chain-builder', title: 'Food Chain Builder', root });
    const { scenes, audio } = services;
    // Malformed data names the file and field in the log and shows the friendly error screen.
    const organisms = await loadJson(new URL('./data/organisms.json', import.meta.url), 'organisms.json', validateOrganisms);
    const { places, habitats } = await loadJson(new URL('./data/habitats.json', import.meta.url), 'habitats.json', (raw) => validateHabitats(raw, organisms));
    for (const place of places) audio.registerSound(`ambient-${place.ambient}`, AMBIENT[place.ambient] ?? AMBIENT.forest);

    const data = { organisms, lookup: byId(organisms), places, habitats };
    /** @type {import('./scenes/FoodScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      build: (choice) => scenes.replace(new BuilderScene(services, routes, data), choice),
      whatIf: (round) => scenes.replace(new WhatIfScene(services, routes, data), round),
      results: (result) => scenes.replace(new ResultScene(services, routes, data), result),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'food-chain-builder:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
