import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateTemplates, validateTheme } from './logic/templates.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/** The themes, in the order the menu shows them. Each is a file in data/themes/. */
const THEMES = ['park', 'kitchen', 'beach', 'classroom', 'space'];

/** Composition root for Spot the Difference: services, validated data, and the scenes wired through a `routes` object. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'spot-the-difference', title: 'Spot the Difference', root });
    const { scenes } = services;
    // Malformed data names the file and field in the log and shows the friendly error screen.
    const templates = await loadJson(new URL('./data/objects.json', import.meta.url), 'objects.json', validateTemplates);
    const loaded = await Promise.all(THEMES.map((id) =>
      loadJson(new URL(`./data/themes/${id}.json`, import.meta.url), `themes/${id}.json`, (raw) => validateTheme(raw, templates, `themes/${id}.json`))));
    const data = { templates, themes: new Map(loaded.map((theme) => [theme.id, theme])) };

    /** @type {import('./scenes/SpotBase.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play: (choice) => scenes.replace(new PlayScene(services, routes, data), choice),
      results: (result) => scenes.replace(new ResultScene(services, routes, data), result),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'spot-the-difference:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
