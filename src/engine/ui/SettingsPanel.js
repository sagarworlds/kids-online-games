import { el } from '../utils/dom.js';
import { logError } from '../utils/errors.js';
import { askParentCheck } from './ParentGate.js';
import { openModal } from './Modal.js';

/**
 * Builds a labelled on/off switch.
 * @returns {HTMLLabelElement}
 */
function toggle(label, checked, onChange) {
  const input = el('input', { attrs: { type: 'checkbox', checked }, on: { change: () => onChange(input.checked) } });
  return el('label', { class: 'toggle' }, input, el('span', { text: label }));
}

/**
 * Opens the parent settings after a successful grown-up check:
 * sound, read-aloud and difficulty lock. Changes apply immediately.
 *
 * @param {{
 *   settings: import('../services/SettingsService.js').SettingsService,
 *   rng: () => number,
 *   extraSections?: Node[]
 * }} deps `extraSections` lets the hub add its "Reset progress" block without
 *   this module knowing about it.
 * @returns {Promise<void>} Resolves when the panel closes (or the check is cancelled).
 */
export async function openParentArea({ settings, rng, extraSections = [] }) {
  if (!(await askParentCheck(rng))) return;

  const apply = (patch) => {
    try {
      settings.set(patch);
    } catch (error) {
      logError(error, 'settings');
    }
  };

  const current = settings.get();
  const lockSelect = el('select', { class: 'select', attrs: { id: 'difficulty-lock' }, on: {
    change: () => apply({ difficultyLock: lockSelect.value || null }),
  } },
  el('option', { text: 'No lock (child chooses)', attrs: { value: '' } }),
  el('option', { text: 'Always Easy', attrs: { value: 'easy' } }),
  el('option', { text: 'Always Medium', attrs: { value: 'medium' } }),
  el('option', { text: 'Always Hard', attrs: { value: 'hard' } }));
  lockSelect.value = current.difficultyLock ?? '';

  const body = el('div', {},
    toggle('Sound effects', current.sound, (sound) => apply({ sound })),
    toggle('Read questions aloud', current.readAloud, (readAloud) => apply({ readAloud })),
    el('div', { class: 'field' },
      el('label', { text: 'Difficulty lock', attrs: { for: 'difficulty-lock' } }),
      lockSelect),
    ...extraSections);

  const modal = openModal({ title: 'Grown-ups settings', body, actions: [{ label: 'Done', variant: 'primary' }] });
  await modal.closed;
}
