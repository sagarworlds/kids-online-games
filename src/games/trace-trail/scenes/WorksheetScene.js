import { TraceBase } from './TraceBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { SETS } from '../logic/glyphs/index.js';
import { createWorksheet } from '../ui/Worksheet.js';

/**
 * A printable worksheet for a set. On screen it is a preview with a Print button; the print styles hide everything else and put
 * the rows on A4 pages. Tracing on a screen helps with letter shapes and stroke order, but holding a real pencil needs paper.
 */
export class WorksheetScene extends TraceBase {
  /** @param {{ setId: string }} params */
  enter({ setId }) {
    const { services } = this;
    const set = SETS[setId];
    if (!set) throw new GameError('UNKNOWN_SET', `There is no set "${setId}"`, { setId });
    const hud = createHud({ homeHref: services.game.homeHref, title: `Worksheet: ${set.label}`, onSettings: () => services.openSettings() });
    this.ui.classList.add('worksheet-scene');
    this.ui.append(hud.el, el('div', { class: 'worksheet' },
      el('div', { class: 'worksheet__actions' },
        createButton({ label: 'Print', icon: '🖨️', variant: 'primary', big: true, onClick: () => window.print() }),
        createButton({ label: 'Back', icon: '◀', onClick: () => this.routes.menu() })),
      el('p', { class: 'worksheet__help', text: 'Print this sheet for pencil practice. Start at dot 1 on each letter and follow the numbers.' }),
      createWorksheet({ title: set.label, glyphs: set.glyphs, guide: set.guide })));
  }
}
