import { StorageService } from '../engine/services/StorageService.js';
import { SettingsService } from '../engine/services/SettingsService.js';
import { RewardService } from '../engine/services/RewardService.js';
import { createRng, randomSeed } from '../engine/utils/random.js';
import { loadJson } from '../engine/utils/data.js';
import { invalidData, logError } from '../engine/utils/errors.js';
import { renderErrorScreen } from '../engine/ui/ErrorScreen.js';
import { registerServiceWorker } from '../app/registerServiceWorker.js';
import { showToast } from '../engine/ui/Toast.js';
import { GAMES } from './gamesRegistry.js';
import { HubPage } from './HubPage.js';
import { ProfileService } from './ProfileService.js';
import { validateNameLists } from './nameGenerator.js';

/** Composition root for the home page: the only place concrete classes are created. */
async function boot() {
  const root = document.getElementById('hub-root');
  try {
    const rng = createRng(randomSeed());
    const storage = new StorageService();
    const settings = new SettingsService({ storage });
    const rewards = new RewardService({ storage });

    const [names, blocklist] = await Promise.all([
      loadJson(new URL('./data/names.json', import.meta.url), 'names.json', validateNameLists),
      loadJson(new URL('./data/blocklist.json', import.meta.url), 'blocklist.json', (data) => {
        if (!Array.isArray(data?.words) || data.words.some((w) => typeof w !== 'string')) {
          invalidData('blocklist.json', 'words', 'must be an array of strings');
        }
        return data.words;
      }),
    ]);

    const profile = new ProfileService({ storage, rng, names, blocklist });
    new HubPage({ root, games: GAMES, profile, rewards, storage, settings, rng }).mount();

    registerServiceWorker();

    if (storage.notice) showToast(storage.notice);
    storage.onNotice((message) => showToast(message));
  } catch (error) {
    logError(error, 'hub');
    renderErrorScreen(root, { homeHref: './index.html' });
  }
}

boot();
