/**
 * The look of each world in 3D. The colours are the ones the 2D board uses (`.world-1` to `.world-3` in style.css), so a
 * child who knows one view knows the other. A world that is not listed falls back to the first.
 *
 * @typedef {{
 *   sky: string, tileA: string, tileB: string, rock: string, line: string, shell: string, nose: string
 * }} Theme `sky` is the colour behind the board; `line` is the dark outline colour used for the frame and the wheels.
 */

/** @type {Readonly<Record<number, Readonly<Theme>>>} */
export const THEMES = Object.freeze({
  1: Object.freeze({ sky: '#cfe9ff', tileA: '#d4eab4', tileB: '#c3df9c', rock: '#9aa0aa', line: '#1f2544', shell: '#5b3df5', nose: '#ffd23f' }),
  2: Object.freeze({ sky: '#dfe4ef', tileA: '#e4e9f2', tileB: '#d2dae9', rock: '#7d8597', line: '#1f2544', shell: '#ff8a00', nose: '#ffffff' }),
  3: Object.freeze({ sky: '#0f1236', tileA: '#343a80', tileB: '#2b3070', rock: '#8e93b8', line: '#0f1236', shell: '#ffd23f', nose: '#ff8a00' }),
});

/** @param {number} world @returns {Readonly<Theme>} */
export const themeFor = (world) => THEMES[world] ?? THEMES[1];
