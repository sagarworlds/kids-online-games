import { el } from '../utils/dom.js';
import { createButton } from './Button.js';

/**
 * The friendly fallback shown instead of a blank page when something breaks.
 * Details go to the console (done by the caller), never to the child.
 *
 * @param {HTMLElement} root Element to fill; its previous content is replaced.
 * @param {{ homeHref: string }} options
 */
export function renderErrorScreen(root, { homeHref }) {
  root.replaceChildren(
    el('div', { class: 'error-screen', attrs: { role: 'alert' } },
      el('div', { class: 'error-screen__emoji', text: '🛠️', attrs: { 'aria-hidden': 'true' } }),
      el('h1', { text: 'Oops, something went wrong' }),
      el('p', { text: 'Do not worry, it is not your fault.' }),
      createButton({ label: 'Back to menu', href: homeHref, variant: 'primary', big: true }),
      createButton({ label: 'Try again', onClick: () => location.reload() }),
    ),
  );
}
