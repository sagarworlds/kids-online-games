import { GameError } from './errors.js';

/** Rows a Page Up or Page Down key moves, as in the ARIA data-grid pattern. */
const DEFAULT_PAGE_ROWS = 5;

/**
 * Where the keyboard focus goes next in a grid of cells that is one Tab stop: Tab brings the focus in (to one cell), and these keys move it
 * from there. A chart with hundreds of cells would otherwise need hundreds of Tab presses to get past it.
 *
 * The keys are the ones the ARIA data-grid pattern uses: the four arrows move one cell and stop at an edge (they do not wrap, so a child
 * who runs off the end is not thrown to the other side); Home and End go to the start and end of the row; with Ctrl they go to the first and
 * last cell of the whole grid; Page Up and Page Down move several rows. A key that is handled but cannot move the focus any further (an arrow at
 * an edge) returns the cell it was on, so the caller still keeps the key from scrolling the page.
 *
 * @param {{ row: number, col: number }} from The cell that has the focus now.
 * @param {string} key A `KeyboardEvent.key`.
 * @param {{ rows: number, cols: number, ctrl?: boolean, pageRows?: number }} grid How big the grid is; `ctrl` is whether Ctrl was held.
 * @returns {{ row: number, col: number }|null} The cell to move to, or null when the key does not move the focus (the caller leaves it alone).
 * @throws {GameError} With code 'BAD_GRID' if the grid has no rows or no columns.
 */
export function nextGridCell(from, key, { rows, cols, ctrl = false, pageRows = DEFAULT_PAGE_ROWS }) {
  if (!(rows >= 1) || !(cols >= 1)) {
    throw new GameError('BAD_GRID', `nextGridCell needs at least one row and one column (got ${rows} x ${cols})`, { rows, cols });
  }
  const lastRow = rows - 1;
  const lastCol = cols - 1;
  const within = (value, last) => Math.min(Math.max(value, 0), last);
  const { row, col } = from;

  switch (key) {
    case 'ArrowRight': return { row, col: within(col + 1, lastCol) };
    case 'ArrowLeft': return { row, col: within(col - 1, lastCol) };
    case 'ArrowDown': return { row: within(row + 1, lastRow), col };
    case 'ArrowUp': return { row: within(row - 1, lastRow), col };
    case 'PageDown': return { row: within(row + pageRows, lastRow), col };
    case 'PageUp': return { row: within(row - pageRows, lastRow), col };
    case 'Home': return ctrl ? { row: 0, col: 0 } : { row, col: 0 };
    case 'End': return ctrl ? { row: lastRow, col: lastCol } : { row, col: lastCol };
    default: return null;
  }
}
