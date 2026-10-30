import { Game } from '../engine/Game.js';
import { GameLoop } from '../engine/GameLoop.js';
import { SceneManager } from '../engine/SceneManager.js';
import { InputService } from '../engine/services/InputService.js';
import { AudioService } from '../engine/services/AudioService.js';
import { StorageService } from '../engine/services/StorageService.js';
import { SettingsService } from '../engine/services/SettingsService.js';
import { RewardService } from '../engine/services/RewardService.js';
import { SpeechService } from '../engine/services/SpeechService.js';
import { ProfileService } from '../hub/ProfileService.js';
import { renderErrorScreen } from '../engine/ui/ErrorScreen.js';
import { showToast } from '../engine/ui/Toast.js';
import { openParentArea } from '../engine/ui/SettingsPanel.js';
import { createRng, randomSeed } from '../engine/utils/random.js';
import { logError } from '../engine/utils/errors.js';

/**
 * Composition root helper for game pages. A game's `main.js` calls this once
 * to get a fully wired set of services, then pushes its first scene.
 *
 * This is the only place (besides the hub's own main.js) where concrete
 * service classes are created; scenes only ever see the resulting interfaces.
 *
 * @param {{
 *   slug: string, title: string, root: HTMLElement,
 *   canvas?: boolean, homeHref?: string
 * }} options `canvas: true` adds a full-size <canvas> beneath the scene UI.
 * @returns {{
 *   game: Game,
 *   services: import('../engine/Scene.js').Services,
 *   openSettings: () => Promise<void>
 * }}
 */
export function createApp({ slug, title, root, canvas = false, homeHref = '../../../index.html' }) {
  const rng = createRng(randomSeed());

  const storage = new StorageService();
  const settings = new SettingsService({ storage });
  const rewards = new RewardService({ storage });
  const profile = new ProfileService({ storage, rng });
  const audio = new AudioService({ settings });
  const speech = new SpeechService({ settings });
  audio.armUnlock();

  const canvasEl = canvas ? document.createElement('canvas') : null;
  if (canvasEl) {
    canvasEl.setAttribute('aria-hidden', 'true');
    root.prepend(canvasEl);
  }

  const input = new InputService({ target: root });
  const scenes = new SceneManager({ uiRoot: root });
  const loop = new GameLoop();

  const game = new Game({
    root,
    canvas: canvasEl,
    scenes,
    loop,
    onFatalError: () => renderErrorScreen(root, { homeHref }),
  });

  // Errors outside the frame loop (click handlers, promises) get the same friendly screen.
  window.addEventListener('error', (event) => game.fail(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => game.fail(event.reason));

  if (storage.notice) showToast(storage.notice);
  storage.onNotice((message) => showToast(message));

  /** Opens the grown-ups settings; scenes pause themselves around this call. */
  const openSettings = () =>
    openParentArea({ settings, rng }).catch((error) => logError(error, 'settings'));

  /** @type {import('../engine/Scene.js').Services} */
  const services = {
    scenes, input, audio, storage, settings, rewards, speech, profile, rng,
    game: { slug, title, homeHref },
  };
  return { game, services, openSettings };
}
