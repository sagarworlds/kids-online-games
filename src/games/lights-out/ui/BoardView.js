import { el } from '../../../engine/utils/dom.js';

/**
 * A jar is drawn with a glowing firefly when lit and left empty and dark when not, so the two states differ by
 * shape and brightness, never by colour alone.
 */
const JAR_LIT = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect x="14" y="10" width="36" height="8" rx="3" class="jar__lid"/>
  <path d="M16 18h32v30a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z" class="jar__glass"/>
  <g class="firefly">
    <ellipse cx="25" cy="30" rx="7" ry="4" class="firefly__wing" transform="rotate(-25 25 30)"/>
    <ellipse cx="39" cy="30" rx="7" ry="4" class="firefly__wing" transform="rotate(25 39 30)"/>
    <ellipse cx="32" cy="38" rx="6" ry="9" class="firefly__body"/>
    <circle cx="32" cy="45" r="4.5" class="firefly__glow"/>
  </g>
</svg>`;
const JAR_OFF = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <rect x="14" y="10" width="36" height="8" rx="3" class="jar__lid"/>
  <path d="M16 18h32v30a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z" class="jar__glass"/>
</svg>`;

/**
 * The grid of jars (DOM buttons, so touch, mouse and keyboard all work).
 *
 * Keyboard: arrow keys move between jars (one jar is in the Tab order, the rest are reached with the arrows);
 * Space or Enter taps. Each jar announces its row, column and whether it holds a firefly.
 *
 * @param {{ size: number, onTap: (r: number, c: number) => void }} options
 * @returns {{
 *   el: HTMLElement,
 *   render: (board: boolean[][], options?: { hint?: [number, number]|null, locked?: boolean }) => void,
 *   focusCell: (r: number, c: number) => void
 * }}
 */
export function createBoardView({ size, onTap }) {
  /** @type {HTMLButtonElement[][]} */
  const buttons = [];
  const root = el('div', { class: 'jars', attrs: { role: 'group', 'aria-label': `Jars, ${size} by ${size}` }, style: { '--size': String(size) } });
  let roving = [0, 0];

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
    render(board, { hint = null, locked = false } = {}) {
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
    },
  };
}
