import { el } from '../../../engine/utils/dom.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { litCells } from '../logic/board.js';

/** The firefly, drawn the same inside a lit jar and when it flies away. */
const FIREFLY = `<g class="firefly">
    <ellipse cx="25" cy="30" rx="7" ry="4" class="firefly__wing" transform="rotate(-25 25 30)"/>
    <ellipse cx="39" cy="30" rx="7" ry="4" class="firefly__wing" transform="rotate(25 39 30)"/>
    <ellipse cx="32" cy="38" rx="6" ry="9" class="firefly__body"/>
    <circle cx="32" cy="45" r="4.5" class="firefly__glow"/>
  </g>`;

/**
 * A jar is drawn with a glowing firefly when lit and left empty and dark when not, so the two states differ by
 * shape and brightness, never by colour alone.
 */
const JAR_LIT = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect x="14" y="10" width="36" height="8" rx="3" class="jar__lid"/>
  <path d="M16 18h32v30a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z" class="jar__glass"/>
  ${FIREFLY}
</svg>`;
const JAR_OFF = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect x="14" y="10" width="36" height="8" rx="3" class="jar__lid"/>
  <path d="M16 18h32v30a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z" class="jar__glass"/>
</svg>`;

/** A freed firefly on its own, framed tightly so it can be sized in pixels. */
const FLYING_FIREFLY = `<svg viewBox="16 24 32 28" aria-hidden="true" focusable="false">${FIREFLY}</svg>`;

/** How far sideways (px) each freed firefly drifts, in turn, so they scatter instead of rising in a column. */
const DRIFT_SPREAD_PX = Object.freeze([-16, 0, 14, -8, 10]);

/** The flight lasts 1.1 s (`drift` in style.css). This is when a firefly is removed even if the browser never reports its animation ending. */
const FLIGHT_CLEANUP_MS = 2000;

/**
 * The grid of jars (DOM buttons, so touch, mouse and keyboard all work).
 *
 * Keyboard: arrow keys move between jars (one jar is in the Tab order, the rest are reached with the arrows);
 * Space or Enter taps. Each jar announces its row, column and whether it holds a firefly.
 *
 * When a move solves the puzzle (the board is drawn locked for the first time), the fireflies that were still in jars rise out of them and
 * fade, over the "solved" card.
 *
 * @param {{ size: number, onTap: (r: number, c: number) => void, flights?: boolean }} options `flights` turns the flying fireflies on or off.
 *   By default they fly unless the device asks for less motion. The 3D board passes false: it uses these jars only as controls under its
 *   picture and flies its own fireflies.
 * @returns {{
 *   el: HTMLElement,
 *   render: (board: boolean[][], options?: { hint?: [number, number]|null, locked?: boolean }) => void,
 *   focusCell: (r: number, c: number) => void,
 *   cell: (r: number, c: number) => HTMLButtonElement
 * }} `cell` gives the button of a jar (the 3D board places these over its picture).
 */
export function createBoardView({ size, onTap, flights = !prefersReducedMotion() }) {
  /** @type {HTMLButtonElement[][]} */
  const buttons = [];
  const root = el('div', { class: 'jars', attrs: { role: 'group', 'aria-label': `Jars, ${size} by ${size}` }, style: { '--size': String(size) } });
  let roving = [0, 0];
  /** The board as last drawn (a copy), to know which jars a move emptied, and whether it was already locked. */
  let shown = null;
  let wasLocked = false;

  /** Sets the fireflies of the given jars free: each rises from its jar, drifts a little sideways and fades, then removes itself. */
  const releaseFireflies = (cells) => {
    cells.forEach(([r, c], index) => {
      const jar = buttons[r][c];
      const flight = el('span', {
        class: 'firefly-flight',
        attrs: { 'aria-hidden': 'true' },
        style: {
          left: `${jar.offsetLeft + jar.offsetWidth / 2}px`,
          top: `${jar.offsetTop + jar.offsetHeight / 2}px`,
          '--dx': `${DRIFT_SPREAD_PX[index % DRIFT_SPREAD_PX.length]}px`,
          'animation-delay': `${(index % 3) * 80}ms`,
        },
      });
      flight.innerHTML = FLYING_FIREFLY; // trusted constant markup
      flight.addEventListener('animationend', () => flight.remove(), { once: true });
      setTimeout(() => flight.remove(), FLIGHT_CLEANUP_MS);
      root.append(flight);
    });
  };

  const focusCell = (r, c) => {
    const rr = Math.max(0, Math.min(size - 1, r));
    const cc = Math.max(0, Math.min(size - 1, c));
    roving = [rr, cc];
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) buttons[i][j].tabIndex = i === rr && j === cc ? 0 : -1;
    buttons[rr][cc].focus();
  };

  for (let r = 0; r < size; r++) {
    buttons.push([]);
    for (let c = 0; c < size; c++) {
      const button = el('button', {
        class: 'jar',
        attrs: { type: 'button', tabindex: r === 0 && c === 0 ? 0 : -1, 'data-r': r, 'data-c': c },
        on: {
          click: () => { roving = [r, c]; onTap(r, c); },
          keydown: (event) => {
            const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
            if (!move) return;
            event.preventDefault();
            focusCell(r + move[0], c + move[1]);
          },
        },
      });
      buttons[r].push(button);
      root.append(button);
    }
  }

  return {
    el: root,
    focusCell,
    cell: (r, c) => buttons[r][c],
    render(board, { hint = null, locked = false } = {}) {
      const justSolved = locked && !wasLocked;
      const before = shown;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const button = buttons[r][c];
          const on = board[r][c];
          button.innerHTML = on ? JAR_LIT : JAR_OFF; // trusted constant markup
          button.classList.toggle('is-lit', on);
          button.classList.toggle('is-hint', Boolean(hint) && hint[0] === r && hint[1] === c);
          button.disabled = locked;
          button.setAttribute('aria-pressed', String(on));
          button.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}, ${on ? 'firefly inside' : 'empty'}`);
        }
      }
      const [rr, cc] = roving;
      for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) buttons[i][j].tabIndex = i === rr && j === cc ? 0 : -1;

      // Every jar is dark now, so the fireflies that just left are the ones the board showed a moment ago.
      if (justSolved && before && flights) releaseFireflies(litCells(before));
      shown = board.map((row) => [...row]);
      wasLocked = locked;
    },
  };
}
