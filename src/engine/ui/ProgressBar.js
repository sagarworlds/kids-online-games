import { el } from '../utils/dom.js';

/**
 * A progress bar exposed to screen readers as `role="progressbar"`.
 * @param {{ label: string, max: number, value?: number }} options
 * @returns {{ el: HTMLElement, set: (value: number) => void }}
 */
export function createProgressBar({ label, max, value = 0 }) {
  const fill = el('div', { class: 'progress__fill' });
  const root = el('div', {
    class: 'progress',
    attrs: { role: 'progressbar', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': max },
  }, fill);

  const set = (next) => {
    const clamped = Math.min(max, Math.max(0, next));
    root.setAttribute('aria-valuenow', String(clamped));
    fill.style.width = `${max === 0 ? 0 : (clamped / max) * 100}%`;
  };
  set(value);
  return { el: root, set };
}
