import { el } from '../utils/dom.js';

/**
 * Shows a short non-blocking message at the bottom of the screen.
 * @param {string} message
 * @param {{ duration?: number }} [options] `duration` in ms; 0 keeps it until the page closes.
 * @returns {() => void} Call to dismiss early.
 */
export function showToast(message, { duration = 6000 } = {}) {
  const node = el('div', { class: 'toast', text: message, attrs: { role: 'status' } });
  document.body.append(node);
  const dismiss = () => node.remove();
  if (duration > 0) setTimeout(dismiss, duration);
  return dismiss;
}
