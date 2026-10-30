import { el } from '../../../engine/utils/dom.js';
import { makeDraggable } from '../../../engine/ui/DragDrop.js';
import { createPiece } from './MoneyPiece.js';
import { formatMoney } from '../logic/currency.js';

/**
 * The cash drawer: one of every coin and note, always in stock. Dragging a piece to the tray (or tapping it, or
 * pressing Enter on it) puts a copy of it in the tray; the drawer itself never runs out or changes.
 *
 * @param {{
 *   currency: import('../logic/currency.js').Currency,
 *   getTrayZone: () => HTMLElement,
 *   onAdd: (denomination: import('../logic/currency.js').Denomination) => boolean|void
 * }} options `onAdd` returns false when the piece is refused (the tray is full), so the drag snaps back.
 * @returns {{ el: HTMLElement }}
 */
export function createCashDrawer({ currency, getTrayZone, onAdd }) {
  const row = (kind, title) => {
    const pieces = currency.denominations.filter((d) => d.kind === kind).map((denomination) => {
      const node = createPiece(denomination, currency, {
        ariaLabel: `${formatMoney(denomination.value, currency)} ${denomination.kind}: add to the tray`,
      });
      makeDraggable(node, {
        getZones: () => [getTrayZone()],
        onDrop: () => onAdd(denomination),
        onActivate: () => { onAdd(denomination); },
      });
      return node;
    });
    return el('div', { class: 'drawer__row', attrs: { role: 'group', 'aria-label': title } }, ...pieces);
  };

  const root = el('section', { class: 'drawer', attrs: { 'aria-label': 'Cash drawer' } },
    el('h2', { class: 'shop__heading', text: 'Cash drawer' }),
    row('coin', 'Coins'), row('note', 'Notes'));
  return { el: root };
}
