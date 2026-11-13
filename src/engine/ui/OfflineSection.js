import { OfflineService, savedPercent, savedSentence } from '../services/OfflineService.js';
import { logError } from '../utils/errors.js';
import { createButton } from './Button.js';
import { el } from '../utils/dom.js';

/**
 * The "Offline play" part of the grown-ups' settings: which games are saved for offline play, and a button that saves them all at once
 * (over the internet, so best done on wifi). It checks with the service worker when it is built and hides itself where there is no
 * worker that answers (an old browser, or the development server).
 *
 * @param {{ saver?: OfflineService }} [deps] `saver` is injectable for tests.
 * @returns {HTMLElement}
 */
export function buildOfflineSection({ saver = new OfflineService() } = {}) {
  const status = el('p', { class: 'offline__status', attrs: { role: 'status' }, text: 'Checking what is saved…' });
  const bar = el('progress', { class: 'offline__bar', attrs: { max: '100', value: '0', 'aria-label': 'Saving games for offline play' } });
  bar.hidden = true;
  const button = createButton({ label: 'Save all games for offline play', icon: '⬇️', onClick: () => saveAll() });
  button.hidden = true;
  const section = el('section', { class: 'offline' }, el('h3', { text: 'Offline play' }), status, bar, button);
  if (!saver.supported) section.hidden = true;

  /** Shows what is saved, and the button when there is more to save. */
  async function refresh(prefix = '') {
    try {
      const saved = await saver.status();
      status.textContent = `${prefix}${savedSentence(saved)}`.trim();
      button.hidden = saved.saved >= saved.total;
    } catch (error) {
      // No worker that answers (the development server, or a browser that blocks workers): there is nothing to offer, and nothing is wrong.
      logError(error, 'offline');
      section.hidden = true;
    }
  }

  async function saveAll() {
    button.disabled = true;
    button.hidden = false;
    bar.hidden = false;
    bar.value = 0;
    status.textContent = 'Saving games for offline play… 0%';
    try {
      const { failed } = await saver.saveAll({
        onProgress: (progress) => {
          bar.value = savedPercent(progress);
          status.textContent = `Saving games for offline play… ${savedPercent(progress)}%`;
        },
      });
      bar.hidden = true;
      button.disabled = false;
      await refresh(failed > 0 ? 'Some games could not be saved. Check the internet connection and try again. ' : '');
      if (failed > 0) button.hidden = false;
    } catch (error) {
      logError(error, 'offline');
      bar.hidden = true;
      button.disabled = false;
      status.textContent = 'Saving did not work. Check the internet connection and try again.';
    }
  }

  if (saver.supported) refresh();
  return section;
}
