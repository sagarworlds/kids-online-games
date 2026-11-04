import { GameError } from '../../../engine/utils/errors.js';

/**
 * Printable tracing sheets: a set is cut into pages, and each glyph gets a row with a model to copy, dotted copies to trace,
 * and room to write it alone. These numbers say how much fits on an A4 page.
 */
export const ROWS_PER_PAGE = Object.freeze({ 'four-line': 7, headline: 7 });

/** How many dotted copies and empty boxes a row has, by how wide the glyph is (a word is wide, so it has fewer). */
export function rowLayout(glyph) {
  return glyph.w > 150 ? { dotted: 1, empty: 1 } : glyph.w > 90 ? { dotted: 2, empty: 1 } : { dotted: 3, empty: 2 };
}

/**
 * Cuts glyphs into pages of rows.
 * @template T
 * @param {readonly T[]} glyphs
 * @param {number} perPage
 * @returns {T[][]}
 * @throws {GameError} 'BAD_PAGE_SIZE'
 */
export function paginate(glyphs, perPage) {
  if (!Number.isInteger(perPage) || perPage < 1) throw new GameError('BAD_PAGE_SIZE', `A page needs at least one row (got ${perPage})`, { perPage });
  const pages = [];
  for (let i = 0; i < glyphs.length; i += perPage) pages.push(glyphs.slice(i, i + perPage));
  return pages;
}
