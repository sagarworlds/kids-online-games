import { createApp } from '../../app/createApp.js';
import { loadJson } from '../../engine/utils/data.js';
import { renderErrorScreen } from '../../engine/ui/ErrorScreen.js';
import { logError } from '../../engine/utils/errors.js';
import { validateCurrency } from './logic/currency.js';
import { validateItems } from './logic/items.js';
import { MenuScene } from './scenes/MenuScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { ResultScene } from './scenes/ResultScene.js';

/**
 * The currency file. To play with another currency, add a file like this one (symbol, notes, coins) and point this
 * at it: nothing else in the game mentions rupees.
 */
const CURRENCY_FILE = 'currency.inr.json';

/** Composition root for Shop Keeper: services, validated data, and the scenes wired through a `routes` object. */
async function boot() {
  const root = document.getElementById('game-root');
  try {
    const { game, services } = createApp({ slug: 'shop-keeper', title: 'Shop Keeper', root });
    const { scenes } = services;
    // Malformed data names the file and field in the log and shows the friendly error screen.
    const [currency, items] = await Promise.all([
      loadJson(new URL(`./data/${CURRENCY_FILE}`, import.meta.url), CURRENCY_FILE, validateCurrency),
      loadJson(new URL('./data/items.json', import.meta.url), 'items.json', validateItems),
    ]);
    const data = { currency, items };

    /** @type {import('./scenes/ShopKeeperScene.js').Routes} */
    const routes = {
      menu: () => scenes.replace(new MenuScene(services, routes, data)),
      play: (round) => scenes.replace(new ShopScene(services, routes, data), round),
      results: (round) => scenes.replace(new ResultScene(services, routes, data), round),
    };
    routes.menu();
    game.start();
  } catch (error) {
    logError(error, 'shop-keeper:boot');
    renderErrorScreen(root, { homeHref: '../../../index.html' });
  }
}

boot();
