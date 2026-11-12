import { el } from '../../../engine/utils/dom.js';
import { ICONS } from '../../../engine/ui/icons.js';

/**
 * A polite live region for what just happened ("Mars is in orbit 4!"). In the 3D scenes the picture cannot be read by a
 * screen reader, so everything it shows is also said here. A ✔ or ✖ comes before good and bad news, so the message is
 * never told only by its colour.
 *
 * @param {{ className: string }} options `className` is the base class; the tone adds `<className>--good|bad|info`.
 * @returns {{ el: HTMLElement, say: (text: string, tone?: 'good'|'bad'|'info') => void }}
 */
export function createStatusLine({ className }) {
  const line = el('p', { class: className, attrs: { role: 'status' } });
  return {
    el: line,
    say(text, tone = 'info') {
      line.className = `${className} ${className}--${tone}`;
      const icon = tone === 'good' ? ICONS.check : tone === 'bad' ? ICONS.cross : '';
      line.replaceChildren(icon ? el('span', { html: icon, attrs: { 'aria-hidden': 'true' } }) : '', icon ? ` ${text}` : text);
    },
  };
}
