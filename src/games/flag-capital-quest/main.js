import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateCountries } from './logic/countries.js';
import { loadWorld } from './ui/worldData.js';
import { ProgressStore } from './scenes/ProgressStore.js';
import { WorldScene } from './scenes/WorldScene.js';
import { TripScene } from './scenes/TripScene.js';
import { TripResultScene } from './scenes/TripResultScene.js';
import { PassportScene } from './scenes/PassportScene.js';

/** Composition root for Flag & Capital Quest: services, validated data and map, and the scenes wired through `routes`. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'flag-capital-quest', title: 'Flag & Capital Quest', root });
    const { scenes, audio } = services;
    // Malformed data (or a map missing a country) names the file and field in the log and shows the friendly error screen.
    const { countries } = await loadJson(new URL('./data/countries.json', import.meta.url), 'countries.json', validateCountries);
    const world = await loadWorld(new URL('./assets/world.svg', import.meta.url), countries.map((c) => c.code));
    audio.registerSound('thunk', [{ f: 150, ms: 70, type: 'triangle', volume: 0.3 }, { f: 90, ms: 120, type: 'triangle', volume: 0.3 }]);

    const data = {
      countries, world, brokenFlags: new Set(),
      progress: new ProgressStore({ rewards: services.rewards, slug: 'flag-capital-quest', codes: countries.map((c) => c.code) }),
    };
    /** @type {import('./scenes/QuestScene.js').Routes} */
    const routes = {
      hub: () => scenes.replace(new WorldScene(services, routes, data)),
      play: (params) => scenes.replace(new TripScene(services, routes, data), params),
      next: (trip) => scenes.replace(new TripScene(services, routes, data), trip),
      results: (trip) => scenes.replace(new TripResultScene(services, routes, data), trip),
      passport: () => scenes.replace(new PassportScene(services, routes, data)),
    };
    routes.hub();
    game.start();
  } catch (error) {
    logError(error, 'flag-capital-quest:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
