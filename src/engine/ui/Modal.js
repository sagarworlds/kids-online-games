import { el } from '../utils/dom.js';
import { createButton } from './Button.js';

let nextId = 0;

/**
 * @typedef {{
 *   label: string, value?: string, variant?: 'primary'|'accent'|'good'|'ghost'|'default',
 *   onClick?: (modal: ModalHandle) => boolean|void
 * }} ModalAction
 * Return `false` from `onClick` to keep the dialog open (for example when validation fails).
 */
/** @typedef {{ dialog: HTMLDialogElement, close: (value?: string) => void, closed: Promise<string> }} ModalHandle */

/**
 * Opens an accessible modal using the native <dialog> element, which gives us
 * focus trapping, the Esc key and an inert background for free.
 *
 * @param {{
 *   title: string, body?: Node|string, actions?: ModalAction[],
 *   dismissible?: boolean, className?: string
 * }} options `dismissible: false` disables Esc and backdrop-click closing.
 * @returns {ModalHandle} `closed` resolves with the value of the action used
 *   ('' when dismissed).
 */
export function openModal({ title, body, actions = [], dismissible = true, className = '' }) {
  const titleId = `modal-title-${nextId++}`;
  const dialog = /** @type {HTMLDialogElement} */ (
    el('dialog', { class: `modal ${className}`.trim(), attrs: { 'aria-labelledby': titleId } })
  );

  /** @type {ModalHandle} */
  const handle = {
    dialog,
    close: (value = '') => dialog.close(value),
    closed: new Promise((resolve) => {
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(dialog.returnValue);
      }, { once: true });
    }),
  };

  dialog.append(el('h2', { class: 'modal__title', text: title, attrs: { id: titleId } }));
  if (body !== undefined) {
    dialog.append(el('div', { class: 'modal__body' }, typeof body === 'string' ? el('p', { text: body }) : body));
  }
  if (actions.length) {
    const row = el('div', { class: 'modal__actions' });
    for (const action of actions) {
      row.append(createButton({
        label: action.label,
        variant: action.variant ?? 'default',
        onClick: () => {
          if (action.onClick?.(handle) === false) return;
          handle.close(action.value ?? action.label);
        },
      }));
    }
    dialog.append(row);
  }

  if (dismissible) {
    // A click whose target is the <dialog> itself landed on the backdrop.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) handle.close('');
    });
  } else {
    dialog.addEventListener('cancel', (event) => event.preventDefault());
  }

  document.body.append(dialog);
  dialog.showModal();
  return handle;
}

/**
 * Yes/no confirmation.
 * @param {{ title: string, message: string, confirmLabel?: string, cancelLabel?: string }} options
 * @returns {Promise<boolean>} True only if the confirm button was used.
 */
export async function confirmDialog({ title, message, confirmLabel = 'Yes', cancelLabel = 'Cancel' }) {
  const { closed } = openModal({
    title,
    body: message,
    actions: [
      { label: cancelLabel, value: 'cancel' },
      { label: confirmLabel, value: 'confirm', variant: 'primary' },
    ],
  });
  return (await closed) === 'confirm';
}
