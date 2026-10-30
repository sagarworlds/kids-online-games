import { el } from '../../../engine/utils/dom.js';

/**
 * On-screen number pad (0-9, backspace, enter). Every key is at least 56 px,
 * above the 48 px minimum, so small fingers can hit them reliably.
 *
 * Keys are labelled with a symbol *and* an accessible name, so the pad works
 * with a screen reader and does not rely on colour.
 *
 * @param {{ onDigit: (digit: string) => void, onBackspace: () => void, onEnter: () => void }} handlers
 * @returns {{ el: HTMLElement, setDisabled: (disabled: boolean) => void }}
 */
export function createNumberPad({ onDigit, onBackspace, onEnter }) {
  /** Order chosen so a 3-column layout reads 123 / 456 / 789 / ⌫0✔ and a 6-column one wraps cleanly. */
  const layout = [
    ...'123456789'.split('').map((d) => ({ label: d, name: d, run: () => onDigit(d), cls: '' })),
    { label: '⌫', name: 'Backspace', run: onBackspace, cls: 'pad__key--aux' },
    { label: '0', name: '0', run: () => onDigit('0'), cls: '' },
    { label: '✔', name: 'Enter, check my answer', run: onEnter, cls: 'pad__key--enter' },
  ];

  const keys = layout.map(({ label, name, run, cls }) =>
    el('button', {
      class: `pad__key ${cls}`.trim(),
      text: label,
      attrs: { type: 'button', 'aria-label': name },
      on: {
        click: (event) => {
          run();
          // A pointer click (detail > 0) should not leave focus on the key: otherwise a later Enter
          // from the physical keyboard would press this key again instead of submitting.
          if (event.detail > 0) event.currentTarget.blur();
        },
      },
    }));

  const root = el('div', { class: 'pad', attrs: { role: 'group', 'aria-label': 'Number pad' } }, ...keys);
  return {
    el: root,
    setDisabled(disabled) {
      for (const key of keys) key.disabled = disabled;
    },
  };
}
