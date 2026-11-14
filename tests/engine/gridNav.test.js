import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextGridCell } from '../../src/engine/utils/gridNav.js';

const GRID = { rows: 34, cols: 12 };
const at = (row, col) => ({ row, col });

test('the arrow keys move one cell and stop at the edges instead of wrapping', () => {
  assert.deepEqual(nextGridCell(at(3, 4), 'ArrowRight', GRID), at(3, 5));
  assert.deepEqual(nextGridCell(at(3, 4), 'ArrowLeft', GRID), at(3, 3));
  assert.deepEqual(nextGridCell(at(3, 4), 'ArrowDown', GRID), at(4, 4));
  assert.deepEqual(nextGridCell(at(3, 4), 'ArrowUp', GRID), at(2, 4));

  // At an edge the focus stays, and the cell comes back so the caller still keeps the key from scrolling the page.
  assert.deepEqual(nextGridCell(at(0, 0), 'ArrowLeft', GRID), at(0, 0));
  assert.deepEqual(nextGridCell(at(0, 0), 'ArrowUp', GRID), at(0, 0));
  assert.deepEqual(nextGridCell(at(33, 11), 'ArrowRight', GRID), at(33, 11));
  assert.deepEqual(nextGridCell(at(33, 11), 'ArrowDown', GRID), at(33, 11));
});

test('Home and End go to the ends of the row, and with Ctrl to the ends of the whole grid', () => {
  assert.deepEqual(nextGridCell(at(7, 5), 'Home', GRID), at(7, 0));
  assert.deepEqual(nextGridCell(at(7, 5), 'End', GRID), at(7, 11));
  assert.deepEqual(nextGridCell(at(7, 5), 'Home', { ...GRID, ctrl: true }), at(0, 0));
  assert.deepEqual(nextGridCell(at(7, 5), 'End', { ...GRID, ctrl: true }), at(33, 11));
});

test('Page Down and Page Up move five rows by default, any number if asked, and stop at the first and last row', () => {
  assert.deepEqual(nextGridCell(at(10, 2), 'PageDown', GRID), at(15, 2));
  assert.deepEqual(nextGridCell(at(10, 2), 'PageUp', GRID), at(5, 2));
  assert.deepEqual(nextGridCell(at(10, 2), 'PageDown', { ...GRID, pageRows: 10 }), at(20, 2));
  assert.deepEqual(nextGridCell(at(31, 2), 'PageDown', GRID), at(33, 2));
  assert.deepEqual(nextGridCell(at(2, 2), 'PageUp', GRID), at(0, 2));
});

test('a key that does not move the focus is left alone (null), so Tab, Enter and letters keep their meaning', () => {
  for (const key of ['Tab', 'Enter', ' ', 'a', 'Escape', 'Shift', 'Delete']) {
    assert.equal(nextGridCell(at(1, 1), key, GRID), null, key);
  }
});

test('a grid of one cell, one row or one column behaves', () => {
  assert.deepEqual(nextGridCell(at(0, 0), 'ArrowRight', { rows: 1, cols: 1 }), at(0, 0));
  assert.deepEqual(nextGridCell(at(0, 2), 'ArrowDown', { rows: 1, cols: 5 }), at(0, 2));
  assert.deepEqual(nextGridCell(at(2, 0), 'ArrowRight', { rows: 5, cols: 1 }), at(2, 0));
  assert.deepEqual(nextGridCell(at(0, 0), 'End', { rows: 1, cols: 5, ctrl: true }), at(0, 4));
});

test('a grid with no rows or no columns is a clear error, not a quiet NaN', () => {
  assert.throws(() => nextGridCell(at(0, 0), 'ArrowDown', { rows: 0, cols: 3 }), { code: 'BAD_GRID' });
  assert.throws(() => nextGridCell(at(0, 0), 'ArrowDown', { rows: 3, cols: 0 }), { code: 'BAD_GRID' });
  assert.throws(() => nextGridCell(at(0, 0), 'ArrowDown', { rows: Number.NaN, cols: 3 }), { code: 'BAD_GRID' });
});
