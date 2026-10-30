import { exceedsThreshold } from '../../../engine/utils/dragMath.js';

/**
 * Draw-an-arrow-by-dragging: press on a card, drag, and let go on another card. A line follows the pointer while it is
 * down. Letting go on empty space cancels without a word; so does letting go on the card you started from.
 *
 * A press that does not move is a tap, and is left alone: the card's own `click` (which a keyboard also raises) handles
 * the tap-then-tap way of drawing. After a real drag the click that follows is swallowed so it does not also count as a tap.
 *
 * @param {HTMLElement} board The element that holds the cards.
 * @param {{
 *   cardIdAt: (clientX: number, clientY: number) => string|null,
 *   centreOf: (id: string) => { x: number, y: number }|null,
 *   toBoard: (clientX: number, clientY: number) => { x: number, y: number },
 *   onLive: (from: { x: number, y: number }|null, to?: { x: number, y: number }, overId?: string|null) => void,
 *   onLink: (fromId: string, toId: string) => void,
 *   canStart?: () => boolean
 * }} options
 * @returns {{ destroy: () => void }}
 */
export function attachLinkGesture(board, { cardIdAt, centreOf, toBoard, onLive, onLink, canStart = () => true }) {
  /** @type {{ pointerId: number, id: string, start: { x: number, y: number }, dragging: boolean }|null} */
  let press = null;
  let swallowClick = false;

  const down = (event) => {
    if (press || (event.pointerType === 'mouse' && event.button !== 0) || !canStart()) return;
    const card = event.target.closest?.('.card');
    if (!card) return;
    press = { pointerId: event.pointerId, id: card.dataset.id, start: { x: event.clientX, y: event.clientY }, dragging: false };
  };

  const move = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!press.dragging) {
      if (!exceedsThreshold(press.start, point)) return;
      press.dragging = true;
      board.setPointerCapture?.(event.pointerId);
    }
    const over = cardIdAt(point.x, point.y);
    onLive(centreOf(press.id), toBoard(point.x, point.y), over && over !== press.id ? over : null);
  };

  const end = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const ended = press;
    press = null;
    if (!ended.dragging) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    onLive(null);
    if (event.type === 'pointercancel') return;
    const target = cardIdAt(event.clientX, event.clientY);
    if (target && target !== ended.id) onLink(ended.id, target);
  };

  const click = (event) => {
    if (!swallowClick || !event.target.closest?.('.card')) return;
    event.stopPropagation();
    event.preventDefault();
  };

  board.addEventListener('pointerdown', down);
  board.addEventListener('pointermove', move);
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);
  board.addEventListener('click', click, true);
  return {
    destroy() {
      board.removeEventListener('pointerdown', down);
      board.removeEventListener('pointermove', move);
      board.removeEventListener('pointerup', end);
      board.removeEventListener('pointercancel', end);
      board.removeEventListener('click', click, true);
    },
  };
}
