/**
 * Inline SVG icons. They are hand-drawn, trusted static markup (safe for
 * innerHTML), and every one pairs a shape with its colour so meaning is never
 * carried by colour alone.
 */
const svg = (body, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" width="1em" height="1em" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = Object.freeze({
  star: svg('<polygon points="12,2 15.1,8.6 22,9.3 16.8,14 18.4,21 12,17.3 5.6,21 7.2,14 2,9.3 8.9,8.6" fill="#ffd23f" stroke="#1f2544" stroke-width="1.6" stroke-linejoin="round"/>'),
  starEmpty: svg('<polygon points="12,2 15.1,8.6 22,9.3 16.8,14 18.4,21 12,17.3 5.6,21 7.2,14 2,9.3 8.9,8.6" fill="none" stroke="#4a5173" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="3 2"/>'),
  shield: svg('<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z" fill="#2f7de1" stroke="#1f2544" stroke-width="1.6" stroke-linejoin="round"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  shieldCracked: svg('<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z" fill="#e9e4d6" stroke="#4a5173" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="3 2"/><path d="m12 4 -2 5 3 3 -2 4 1 4" fill="none" stroke="#b3261e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  check: svg('<path d="m4 12.5 5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  cross: svg('<path d="m5 5 14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>'),
});
