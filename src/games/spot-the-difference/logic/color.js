import { GameError } from '../../../engine/utils/errors.js';

/** @typedef {{ h: number, s: number, l: number }} Hsl  Hue 0 to 360, saturation and lightness 0 to 100. */

const HEX = /^#[0-9a-f]{6}$/i;

/** @param {string} hex @returns {{ r: number, g: number, b: number }} @throws {GameError} 'BAD_COLOR' */
export function hexToRgb(hex) {
  if (!HEX.test(hex)) throw new GameError('BAD_COLOR', `"${hex}" is not a colour like #aabbcc`, { hex });
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

/** @param {{ r: number, g: number, b: number }} rgb @returns {string} */
export const rgbToHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** @param {string} hex @returns {Hsl} */
export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

/** @param {Hsl} hsl @returns {string} */
export function hslToHex({ h, s, l }) {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h % 360) / 60) % 2 - 1));
  const m = L - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/** The angle between two hues, 0 to 180 degrees. @param {number} a @param {number} b */
export const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** How far apart two colours are as plain RGB, 0 to about 441. @param {string} a @param {string} b */
export function rgbDistance(a, b) {
  const p = hexToRgb(a);
  const q = hexToRgb(b);
  return Math.hypot(p.r - q.r, p.g - q.g, p.b - q.b);
}

/**
 * The darker ("d") or lighter ("l") shade of a colour, used for shading parts of an object so it keeps its look when it
 * changes colour. @param {string} hex @param {'d'|'l'} kind @returns {string}
 */
export function shade(hex, kind) {
  const hsl = hexToHsl(hex);
  return hslToHex({ h: hsl.h, s: hsl.s, l: kind === 'd' ? Math.max(10, hsl.l - 18) : Math.min(92, hsl.l + 22) });
}

/**
 * A pleasant colour for an object: a clear hue, strong but not neon, neither dark nor pale, so every object is easy to see
 * against every background.
 * @param {() => number} rng
 * @returns {string}
 */
export function randomColor(rng) {
  return hslToHex({ h: Math.floor(rng() * 360), s: 55 + Math.floor(rng() * 30), l: 42 + Math.floor(rng() * 20) });
}

/**
 * A different colour that is clearly different: the hue is turned by an angle within the given range (either way) and
 * the lightness changes by at least `minLight` points, and the result is checked in RGB too so it cannot look the same.
 *
 * @param {string} hex
 * @param {() => number} rng
 * @param {{ minHue: number, maxHue: number, minLight: number, minRgb: number }} limits
 * @returns {string}
 */
export function differentColor(hex, rng, { minHue, maxHue, minLight, minRgb }) {
  const from = hexToHsl(hex);
  for (let attempt = 0; attempt < 60; attempt++) {
    const turn = (minHue + rng() * (maxHue - minHue)) * (rng() < 0.5 ? -1 : 1);
    const lightShift = (minLight + rng() * 10) * (rng() < 0.5 ? -1 : 1);
    const l = Math.min(78, Math.max(30, from.l + lightShift));
    const next = hslToHex({ h: (from.h + turn + 360) % 360, s: Math.max(50, Math.min(90, from.s)), l });
    const to = hexToHsl(next);
    if (hueDistance(from.h, to.h) >= minHue - 1 && Math.abs(to.l - from.l) >= minLight && rgbDistance(hex, next) >= minRgb) return next;
  }
  // Never reached with real colours, but a guaranteed answer is better than an endless search.
  return hslToHex({ h: (from.h + Math.max(minHue, 120)) % 360, s: 70, l: from.l > 55 ? 35 : 70 });
}
