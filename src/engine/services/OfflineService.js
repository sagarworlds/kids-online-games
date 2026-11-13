import { GameError } from '../utils/errors.js';

/**
 * The page's side of "save all games for offline play" (see sw.js): it asks the service worker what is saved, asks it to save everything,
 * and passes its progress on. The worker is the one that knows the list of files, so the page never needs it.
 *
 * Both calls reject with a GameError coded 'OFFLINE_UNAVAILABLE' when there is no worker that answers.
 */
export class OfflineService {
  #nav;
  #timeoutMs;

  /**
   * @param {{
   *   nav?: Pick<Navigator, 'serviceWorker'>, timeoutMs?: number
   * }} [options] `nav` is injectable for tests. `timeoutMs` is how long to wait for the worker to answer before deciding it is not the
   *   production worker (the development server's worker does nothing, so it never answers).
   */
  constructor({ nav = globalThis.navigator, timeoutMs = 4000 } = {}) {
    this.#nav = nav;
    this.#timeoutMs = timeoutMs;
  }

  /** @returns {boolean} False where the browser has no service workers at all. */
  get supported() {
    return Boolean(this.#nav?.serviceWorker);
  }

  /** @returns {Promise<{ saved: number, total: number }>} How many games are saved for offline play, out of how many there are. */
  status() {
    return this.#converse({ type: 'STATUS' }, (data, finish) => {
      if (data?.type === 'STATUS') finish({ saved: data.saved, total: data.total });
    });
  }

  /**
   * Saves every game (and the 3D library).
   * @param {{ onProgress?: (progress: { done: number, total: number }) => void }} [options]
   * @returns {Promise<{ done: number, total: number, failed: number }>} `failed` counts files that could not be saved.
   */
  saveAll({ onProgress = () => {} } = {}) {
    return this.#converse({ type: 'SAVE_ALL' }, (data, finish) => {
      if (data?.type === 'SAVE_PROGRESS') onProgress({ done: data.done, total: data.total });
      else if (data?.type === 'SAVE_DONE') finish({ done: data.done, total: data.total, failed: data.failed });
    });
  }

  #unavailable(why) {
    return new GameError('OFFLINE_UNAVAILABLE', `offline saving is not available: ${why}`);
  }

  /** Resolves with the active worker, or rejects if there is none within the time. */
  #activeWorker() {
    if (!this.supported) return Promise.reject(this.#unavailable('this browser has no service worker'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(this.#unavailable('no service worker is active')), this.#timeoutMs);
      this.#nav.serviceWorker.ready.then((registration) => {
        clearTimeout(timer);
        if (registration.active) resolve(registration.active);
        else reject(this.#unavailable('the service worker is not active yet'));
      }, reject);
    });
  }

  /**
   * Sends one message to the worker and listens for its replies until `handle` says it is finished.
   * @param {object} message
   * @param {(data: any, finish: (value: any) => void) => void} handle Called for each message from the worker.
   */
  async #converse(message, handle) {
    const worker = await this.#activeWorker();
    const { serviceWorker } = this.#nav;
    return new Promise((resolve, reject) => {
      let timer;
      const stop = () => {
        clearTimeout(timer);
        serviceWorker.removeEventListener('message', onMessage);
      };
      const finish = (value) => {
        stop();
        resolve(value);
      };
      function onMessage(event) {
        // Any reply shows the worker is the real one, so the wait for a first answer is over.
        clearTimeout(timer);
        handle(event.data, finish);
      }
      timer = setTimeout(() => {
        stop();
        reject(this.#unavailable('the service worker did not answer'));
      }, this.#timeoutMs);
      serviceWorker.addEventListener('message', onMessage);
      worker.postMessage(message);
    });
  }
}

/**
 * How far along saving is, as a whole percentage.
 * @param {{ done: number, total: number }} progress
 * @returns {number} 0 to 100.
 */
export function savedPercent({ done, total }) {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
}

/**
 * The sentence the grown-ups' settings show about what is saved.
 * @param {{ saved: number, total: number }} status
 * @returns {string}
 */
export function savedSentence({ saved, total }) {
  if (saved >= total) return `All ${total} games are saved for offline play.`;
  return `${saved} of ${total} games are saved for offline play. Each game is also saved the first time it is opened while online.`;
}
