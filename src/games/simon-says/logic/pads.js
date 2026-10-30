/**
 * @typedef {{ id: number, name: string, color: string, shape: string, freqHz: number, key: string }} Pad
 * Every pad has a colour, a unique shape and a number, so colour-blind players and keyboard players are never stuck.
 */

/**
 * The first four pads are the notes of a C major chord (C4, E4, G4, C5), so any sequence sounds pleasant. Hard adds
 * A4 and D5 as pads 5 and 6.
 * @type {readonly Pad[]}
 */
export const PADS = Object.freeze([
  { id: 0, name: 'Red', color: '#ff6b6b', shape: 'circle', freqHz: 261.63, key: '1' },
  { id: 1, name: 'Blue', color: '#5aa9ff', shape: 'square', freqHz: 329.63, key: '2' },
  { id: 2, name: 'Green', color: '#5bd67a', shape: 'triangle', freqHz: 392.0, key: '3' },
  { id: 3, name: 'Yellow', color: '#ffd23f', shape: 'star', freqHz: 523.25, key: '4' },
  { id: 4, name: 'Purple', color: '#b58cff', shape: 'hexagon', freqHz: 440.0, key: '5' },
  { id: 5, name: 'Orange', color: '#ff9f43', shape: 'diamond', freqHz: 587.33, key: '6' },
].map(Object.freeze));

/** @param {number} count 4 or 6. @returns {Pad[]} */
export function padsFor(count) {
  return PADS.slice(0, count);
}
