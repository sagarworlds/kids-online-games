import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { createViewChoice } from '../../engine/three/view.js';
import { validateCountries } from './logic/countries.js';
import { loadWorld } from './ui/worldData.js';
import { ProgressStore } from './scenes/ProgressStore.js';
import { WorldScene } from './scenes/WorldScene.js';
import { TripScene } from './scenes/TripScene.js';
import { TripResultScene } from './scenes/TripResultScene.js';
import { PassportScene } from './scenes/PassportScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';

/** How long loading the 3D globe may take before a "getting the globe ready" screen is put up (so a quick load shows no flash). */
const LOADING_SCREEN_AFTER_MS = 250;

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
    const view = createViewChoice({ storage: services.storage, slug: services.game.slug });
    const hub2d = () => scenes.replace(new WorldScene(services, routes, data));
    const trip2d = (params) => scenes.replace(new TripScene(services, routes, data), params);

    /**
     * Opens a screen in the child's chosen view. three.js is about 2 MB, so the 3D scene is loaded with `import()` only when
     * it is needed: the 2D game and the home page never download it. Anything that goes wrong on the way into 3D (the file
     * will not load, the device has no WebGL 2, the scene fails to start) is logged and the 2D screen opens instead, so a
     * child never sees a blank screen or an error for a view they did not need.
     * @param {() => Promise<object>} load Imports the 3D scene's module.
     * @param {(module: object) => import('../../engine/Scene.js').Scene} make Builds the 3D scene from the module.
     * @param {Record<string, unknown>|undefined} params What the scene is opened with.
     * @param {() => void} fallBack Opens the 2D version.
     */
    const open = async (load, make, params, fallBack) => {
      if (view.mode() === '3d') {
        // On a slow connection the 3D file takes a while: show a short "getting ready" screen rather than nothing.
        const waiting = setTimeout(() => scenes.replace(new LoadingScene(services, routes, data)), LOADING_SCREEN_AFTER_MS);
        try {
          const module = await load();
          clearTimeout(waiting);
          scenes.replace(make(module), params);
          return;
        } catch (error) {
          clearTimeout(waiting);
          logError(error, 'flag-capital-quest:3d');
          view.fallBack();
        }
      }
      fallBack();
    };
    const hub = () => open(() => import('./three/World3DScene.js'), (m) => new m.World3DScene(services, routes, data), undefined, hub2d);
    const trip = (params) => open(() => import('./three/Trip3DScene.js'), (m) => new m.Trip3DScene(services, routes, data), params, () => trip2d(params));

    /** @type {import('./scenes/QuestScene.js').Routes} */
    const routes = {
      hub,
      play: trip,
      next: trip,
      results: (finished) => scenes.replace(new TripResultScene(services, routes, data), finished),
      passport: () => scenes.replace(new PassportScene(services, routes, data)),
      view: { supported: view.supported, mode: view.mode, choose: view.choose },
      fallBack: { hub: () => { view.fallBack(); hub2d(); }, trip: (current) => { view.fallBack(); trip2d(current); } },
    };
    routes.hub();
    game.start();
  } catch (error) {
    logError(error, 'flag-capital-quest:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
