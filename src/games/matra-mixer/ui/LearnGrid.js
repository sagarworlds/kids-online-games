import { el } from '../../../engine/utils/dom.js';
import { nextGridCell } from '../../../engine/utils/gridNav.js';
import { signOnItsOwn } from '../logic/devanagari.js';

/**
 * The बाराखडी chart: the consonants down the side and the vowel signs across the top. Tapping a cell picks that syllable.
 *
 * With a keyboard the chart is one Tab stop, not the 400 or so it has cells: Tab brings the focus to one cell, the arrow keys, Home, End,
 * Page Up and Page Down move it (`nextGridCell`), and Enter or Space picks the cell. The cell that last had the focus is the one Tab comes
 * back to.
 *
 * @param {{ content: import('../logic/levels.js').Content, onPick: (syllable: import('../logic/levels.js').Syllable) => void }} options
 * @returns {{ el: HTMLElement, select: (syllable: import('../logic/levels.js').Syllable|null) => void }}
 */
export function createLearnGrid({ content, onPick }) {
  const cells = new Map();
  /** The buttons by row and column, and where each button is. */
  const grid = [];
  const positions = new Map();
  let current = { row: 0, col: 0 };

  const head = el('tr', {}, el('th', { class: 'grid__corner', attrs: { scope: 'col' } }, el('span', { class: 'sr-only', text: 'Letter' })),
    ...content.signs.map((sign) => el('th', { class: 'grid__sign', attrs: { scope: 'col' } },
      el('span', { class: 'grid__sign-mark', text: signOnItsOwn(sign) }), el('span', { class: 'grid__sign-vowel', text: sign.vowel }))));
  const rows = content.consonants.map((consonant, row) => {
    const rowCells = content.signs.map((sign, col) => {
      const syllable = content.syllables.find((s) => s.consonant === consonant && s.sign === sign);
      const cell = el('button', {
        class: 'grid__cell', text: syllable.text,
        // Only the cell that has (or last had) the focus is a Tab stop; the others are reached with the arrow keys.
        attrs: { type: 'button', tabindex: row === 0 && col === 0 ? 0 : -1, 'aria-label': `${consonant.char} with ${signOnItsOwn(sign)}: ${syllable.text}` },
        on: { click: () => onPick(syllable) },
      });
      cells.set(syllable, cell);
      positions.set(cell, { row, col });
      return cell;
    });
    grid.push(rowCells);
    return el('tr', {}, el('th', { class: 'grid__letter', text: consonant.char, attrs: { scope: 'row' } }), ...rowCells.map((cell) => el('td', {}, cell)));
  });

  /** Makes `row`, `col` the cell Tab comes back to. */
  const setCurrent = (row, col) => {
    grid[current.row][current.col].tabIndex = -1;
    current = { row, col };
    grid[row][col].tabIndex = 0;
  };

  const table = el('table', {
    class: 'grid',
    on: {
      keydown: (event) => {
        const from = positions.get(event.target);
        // Not a cell, or a shortcut of the browser or the screen reader (Alt+Left is "back", Alt+Ctrl+arrows move around a table).
        if (!from || event.altKey || event.metaKey) return;
        const to = nextGridCell(from, event.key, { rows: grid.length, cols: content.signs.length, ctrl: event.ctrlKey });
        if (!to) return;
        // Also at an edge, where the focus stays: the key must not scroll the page.
        event.preventDefault();
        setCurrent(to.row, to.col);
        grid[to.row][to.col].focus();
      },
      // A tap or a click puts the focus on a cell too, and Tab should come back to that one.
      focusin: (event) => {
        const at = positions.get(event.target);
        if (at) setCurrent(at.row, at.col);
      },
    },
  }, el('thead', {}, head), el('tbody', {}, ...rows));

  const hint = el('p', { class: 'sr-only', attrs: { id: 'grid-hint' }, text: 'Press Tab once to reach the chart, then use the arrow keys to move between syllables and Enter to hear one.' });
  return {
    el: el('div', { class: 'grid__scroller', attrs: { role: 'region', 'aria-label': 'Letters down the side, vowel signs across the top', 'aria-describedby': 'grid-hint' } }, hint, table),
    select(syllable) {
      for (const [s, cell] of cells) cell.classList.toggle('is-picked', s === syllable);
    },
  };
}
