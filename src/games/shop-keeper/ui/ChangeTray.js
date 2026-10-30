import { el } from '../../../engine/utils/dom.js';
import { makeDraggable } from '../../../engine/ui/DragDrop.js';
import { createPiece } from './MoneyPiece.js';
import { formatMoney } from '../logic/currency.js';

/**
 * The change tray: where the child builds the change. Dropping a piece from the drawer on it adds the piece; tapping
 * a piece in the tray (or dragging it out of the tray, back to the drawer) sends it back.
 *
 * @param {{
 *   currency: import('../logic/currency.js').Currency,
 *   getDrawerZone: () => HTMLElement,
 *   onRemove: (index: number) => void
 * }} options
 * @returns {{
 *   el: HTMLElement, zone: HTMLElement,
 *   render: (pieces: readonly import('../logic/currency.js').Denomination[], state?: { total?: number|null, locked?: boolean }) => void
 * }}
 */
export function createChangeTray({ currency, getDrawerZone, onRemove }) {
  const piecesEl = el('div', { class: 'tray__pieces', attrs: { role: 'list', 'aria-label': 'Pieces in the tray' } });
  const emptyEl = el('p', { class: 'tray__empty', text: 'Drop money here' });
  const totalEl = el('p', { class: 'tray__total', attrs: { role: 'status' } });
  const zone = el('div', { class: 'tray__zone' }, emptyEl, piecesEl);
  const root = el('section', { class: 'tray', attrs: { 'aria-label': 'Change tray' } },
    el('h2', { class: 'shop__heading', text: 'Change tray' }), zone, totalEl);

  /** Draggable handles of the pieces now showing, released when the tray is redrawn. */
  let handles = [];

  function render(pieces, { total = null, locked = false } = {}) {
    handles.forEach((h) => h.destroy());
    handles = [];
    // Largest first, so the tray reads like a till drawer. The sort is stable, so equal values keep their order.
    const order = pieces.map((piece, index) => ({ piece, index })).sort((a, b) => b.piece.value - a.piece.value);
    piecesEl.replaceChildren(...order.map(({ piece, index }) => {
      const node = createPiece(piece, currency, {
        ariaLabel: `${formatMoney(piece.value, currency)} ${piece.kind}${locked ? '' : ': put back in the drawer'}`,
      });
      node.setAttribute('role', 'listitem');
      if (locked) node.disabled = true;
      else handles.push(makeDraggable(node, { getZones: () => [getDrawerZone()], onDrop: () => { onRemove(index); }, onActivate: () => onRemove(index) }));
      return node;
    }));
    emptyEl.hidden = pieces.length > 0;
    totalEl.textContent = total === null ? '' : `In the tray: ${formatMoney(total, currency)}`;
  }

  return { el: root, zone, render };
}
