import { el } from '../../../engine/utils/dom.js';
import { makeDraggable } from '../../../engine/ui/DragDrop.js';
import { composeSyllable, signOnItsOwn } from '../logic/devanagari.js';

/**
 * The matra station: choose a consonant (it sits on the train), then drag a vowel sign onto it, or tap the sign, to make a
 * syllable. Dragging is never required: every sign is a button.
 *
 * @param {{
 *   content: import('../logic/levels.js').Content,
 *   onMix: (consonant: import('../logic/devanagari.js').Consonant, sign: import('../logic/devanagari.js').Sign) => void
 * }} options
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function createMixer({ content, onMix }) {
  let consonant = content.consonants[0];
  const handles = [];
  const letterEl = el('span', { class: 'mixer__letter', text: consonant.char, attrs: { lang: 'hi' } });
  const resultEl = el('span', { class: 'mixer__result', attrs: { 'aria-live': 'polite' } });
  const zone = el('div', { class: 'mixer__zone', attrs: { role: 'group', 'aria-label': 'The train car. Drop a vowel sign here.' } },
    letterEl, el('span', { class: 'mixer__hint', text: 'Drop a vowel sign here' }), resultEl);

  const mix = (sign) => {
    resultEl.textContent = `${consonant.char} + ${signOnItsOwn(sign)} = ${composeSyllable(consonant, sign)}`;
    onMix(consonant, sign);
  };

  const chips = content.consonants.map((c) => el('button', {
    class: 'chip chip--letter', text: c.char, attrs: { type: 'button', 'aria-pressed': String(c === consonant), 'aria-label': `Letter ${c.char}` },
    on: { click: () => {
      consonant = c;
      letterEl.textContent = c.char;
      resultEl.textContent = '';
      chips.forEach((chip, i) => chip.setAttribute('aria-pressed', String(content.consonants[i] === c)));
    } },
  }));
  const tiles = content.signs.map((sign) => {
    const tile = el('button', { class: 'tile tile--sign', text: signOnItsOwn(sign), attrs: { type: 'button', 'aria-label': `Vowel sign ${signOnItsOwn(sign)}. Press to add it to the letter.` } });
    handles.push(makeDraggable(tile, { getZones: () => [zone], onDrop: () => { mix(sign); return true; }, onActivate: () => mix(sign) }));
    return tile;
  });

  return {
    el: el('div', { class: 'mixer' },
      el('p', { class: 'mixer__step', text: '1. Pick a letter for the train' }),
      el('div', { class: 'mixer__letters', attrs: { role: 'group', 'aria-label': 'Letters' } }, ...chips),
      el('p', { class: 'mixer__step', text: '2. Drag a vowel sign onto the car' }),
      el('div', { class: 'mixer__train' }, el('span', { class: 'mixer__engine', text: '🚂', attrs: { 'aria-hidden': 'true' } }), zone),
      el('div', { class: 'tiles mixer__signs', attrs: { role: 'group', 'aria-label': 'Vowel signs' } }, ...tiles)),
    destroy() {
      for (const handle of handles) handle.destroy();
    },
  };
}
