import { el } from '../../../engine/utils/dom.js';
import { MAX_NEED } from '../logic/plants.js';

let sliders = 0;

/**
 * A big, native `<input type="range">` for one need (water, sunlight or fertiliser), 0 to 10. Native means arrow keys,
 * Home, End and touch all work with no extra code. On Easy the plant's ideal range is shown as a green band behind the
 * track, with the numbers in words as well.
 *
 * @param {{
 *   need: string, label: string, icon: string, value: number, range: readonly [number, number]|null,
 *   onInput: (value: number) => void
 * }} options
 * @returns {{ el: HTMLElement, setValue: (value: number) => void, setDisabled: (disabled: boolean) => void, focus: () => void }}
 */
export function createNeedSlider({ need, label, icon, value, range, onInput }) {
  const id = `need-${need}-${++sliders}`;
  const output = el('output', { class: 'need__value', attrs: { for: id } });
  const input = el('input', {
    class: 'need__input',
    attrs: { id, type: 'range', min: 0, max: MAX_NEED, step: 1, value, 'aria-describedby': range ? `${id}-best` : false },
  });
  const sync = () => {
    output.textContent = input.value;
    input.setAttribute('aria-valuetext', `${input.value} out of ${MAX_NEED}`);
  };
  input.addEventListener('input', () => { sync(); onInput(Number(input.value)); });
  sync();

  // The band covers the ideal numbers, each taking up a tenth of the track, so it spans half a step either side.
  const band = range
    ? el('span', { class: 'need__ideal', style: { '--from': String(Math.max(0, range[0] - 0.5) / MAX_NEED), '--to': String(Math.min(MAX_NEED, range[1] + 0.5) / MAX_NEED) }, attrs: { 'aria-hidden': 'true' } })
    : null;
  const best = range
    ? el('span', { class: 'need__best', attrs: { id: `${id}-best` }, text: `Best: ${range[0] === range[1] ? range[0] : `${range[0]} to ${range[1]}`}` })
    : null;

  const root = el('div', { class: `need need--${need}` },
    el('div', { class: 'need__head' },
      el('label', { class: 'need__label', attrs: { for: id } }, el('span', { text: icon, attrs: { 'aria-hidden': 'true' } }), ` ${label}`),
      best, output),
    el('div', { class: 'need__track' }, band, input),
    el('div', { class: 'need__ends', attrs: { 'aria-hidden': 'true' } }, el('span', { text: 'None' }), el('span', { text: 'Lots' })));

  return {
    el: root,
    setValue(next) { input.value = String(next); sync(); },
    setDisabled(disabled) { input.disabled = disabled; },
    focus() { input.focus(); },
  };
}
