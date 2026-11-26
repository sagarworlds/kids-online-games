import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { parseWeight, MIN_KG, MAX_KG } from '../logic/weight.js';

/**
 * The first step of the weigh-in: say how much you weigh (Medium and Hard) or pick something to weigh (every level).
 * The 2D and 3D weigh-ins both open with this, so what is asked and how a bad number is explained is the same in both.
 *
 * The weight is handed to `onStart` and kept nowhere else: it is not saved and does not leave the device.
 *
 * @param {{
 *   ownWeight: boolean,
 *   presets: readonly { label: string, icon: string, kg: number }[],
 *   onStart: (kg: number, who: string) => void
 * }} options `ownWeight` is `LEVELS[level].weigh.ownWeight`. `who` is "You" for a typed weight, else the toy's label.
 * @returns {{ el: HTMLElement, focus: () => void }} `focus` puts the cursor in the weight box (it does nothing when
 *   there is none), for the scene to call once the panel is on screen.
 */
export function createWeightSetup({ ownWeight, presets, onStart }) {
  const presetsEl = el('div', { class: 'presets', attrs: { role: 'group', 'aria-label': 'Things to weigh' } },
    ...presets.map((preset) => el('button', {
      class: 'preset', attrs: { type: 'button', 'aria-label': preset.label }, on: { click: () => onStart(preset.kg, preset.label) },
    }, el('span', { class: 'preset__icon', text: preset.icon, attrs: { 'aria-hidden': 'true' } }), el('span', { text: preset.label }))));
  const privacy = el('p', { class: 'setup__privacy', text: 'Your weight is only used while you play. It is never saved.' });

  if (!ownWeight) {
    return {
      el: el('section', { class: 'setup' },
        el('h1', { text: 'What shall we weigh?' }),
        el('p', { text: 'Pick something, then hop from planet to planet to see how heavy it would feel.' }), presetsEl, privacy),
      focus: () => {},
    };
  }

  const error = el('p', { class: 'setup__error', attrs: { role: 'alert', id: 'weight-error' } });
  error.hidden = true;
  const input = el('input', {
    class: 'setup__input',
    attrs: { id: 'weight', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': 'weight-help weight-error', maxlength: 6 },
  });
  /** Reads the box. A weight that cannot be used is explained on the spot; anything unexpected is not hidden. */
  const submit = () => {
    try {
      onStart(parseWeight(input.value), 'You');
    } catch (failure) {
      if (!(failure instanceof GameError) || failure.code !== 'BAD_WEIGHT') throw failure;
      error.textContent = failure.message;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  };
  const form = el('form', { class: 'setup__form', attrs: { novalidate: true }, on: { submit: (event) => { event.preventDefault(); submit(); } } },
    el('label', { class: 'setup__label', attrs: { for: 'weight' }, text: 'Your weight in kilograms' }),
    el('p', { class: 'setup__help', attrs: { id: 'weight-help' }, text: `A number from ${MIN_KG} to ${MAX_KG}` }),
    el('div', { class: 'setup__row' }, input, createButton({ label: 'Start hopping', icon: '🚀', variant: 'primary', big: true, onClick: submit })),
    error);
  return {
    el: el('section', { class: 'setup' }, el('h1', { text: 'How heavy are you?' }), form, el('p', { class: 'setup__or', text: 'Or try something else:' }), presetsEl, privacy),
    focus: () => input.focus(),
  };
}
