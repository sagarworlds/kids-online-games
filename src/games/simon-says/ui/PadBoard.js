import { el } from '../../../engine/utils/dom.js';

const SHAPES = {
  circle: '<circle cx="32" cy="32" r="20"/>',
  square: '<rect x="13" y="13" width="38" height="38" rx="5"/>',
  triangle: '<polygon points="32,10 55,52 9,52"/>',
  star: '<polygon points="32,8 39,25 57,26 43,38 48,56 32,46 16,56 21,38 7,26 25,25"/>',
  hexagon: '<polygon points="32,8 54,20 54,44 32,56 10,44 10,20"/>',
  diamond: '<polygon points="32,8 54,32 32,56 10,32"/>',
};

/** Blends a #rrggbb colour with white, for the pad's resting (unlit) look. @param {string} hex @param {number} amount 0-1 */
function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (shift) => Math.round(((n >> shift) & 255) * (1 - amount) + 255 * amount);
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/**
 * The pads as big DOM buttons. Each shows its shape and number as well as its colour, and announces all three,
 * so colour-blind players and keyboard players (keys 1-6) can play without relying on colour.
 *
 * @param {{ pads: readonly import('../logic/pads.js').Pad[], onPress: (padId: number) => void }} options
 * @returns {{
 *   el: HTMLElement,
 *   light: (padId: number, on: boolean) => void,
 *   setEnabled: (enabled: boolean) => void
 * }}
 */
export function createPadBoard({ pads, onPress }) {
  /** @type {Map<number, HTMLButtonElement>} */
  const buttons = new Map();
  const root = el('div', { class: `pads pads--${pads.length}`, attrs: { role: 'group', 'aria-label': 'Pads' } });

  for (const pad of pads) {
    const button = el('button', {
      class: 'pad',
      attrs: { type: 'button', 'data-pad': pad.id, 'aria-label': `${pad.name} pad, ${pad.shape}, key ${pad.key}` },
      style: { '--pad': pad.color, '--pad-soft': lighten(pad.color, 0.55) },
      on: { click: () => onPress(pad.id) },
    },
    // The shape is trusted static SVG markup from the table above, so it is safe to set as HTML.
    el('span', { class: 'pad__shape', html: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${SHAPES[pad.shape]}</svg>` }),
    el('span', { class: 'pad__key', text: pad.key, attrs: { 'aria-hidden': 'true' } }));
    buttons.set(pad.id, button);
    root.append(button);
  }

  return {
    el: root,
    light: (padId, on) => buttons.get(padId)?.classList.toggle('is-lit', on),
    setEnabled(enabled) {
      root.classList.toggle('is-waiting', !enabled);
      for (const b of buttons.values()) b.setAttribute('aria-disabled', String(!enabled));
    },
  };
}
