import { TraceBase } from './TraceBase.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, roundKey } from '../logic/levels.js';
import { SETS } from '../logic/glyphs/index.js';

/** Menu: pick a level, then a set of letters to trace. Each set also has a printable worksheet. */
export class MenuScene extends TraceBase {
  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const setsEl = el('div', { class: 'sets' });

    const draw = () => {
      const { bestStars } = services.rewards.getSave(services.game.slug);
      setsEl.replaceChildren(...LEVELS[levelId].setIds.map((setId) => {
        const set = SETS[setId];
        const stars = bestStars[roundKey(setId)] ?? 0;
        return el('div', { class: 'set' },
          el('button', {
            class: 'set__play', attrs: { type: 'button', 'aria-label': `${set.label}: ${set.blurb}. ${stars} of 3 stars.` },
            on: { click: () => { services.audio.play('click'); this.routes.trace({ setId, levelId }); } },
          },
          el('span', { class: 'set__icon', text: set.icon, attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'set__name', text: set.label }),
          el('span', { class: 'set__blurb', text: set.blurb }),
          el('span', { class: 'menu__stars', html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars), attrs: { 'aria-hidden': 'true' } })),
          createButton({ label: 'Worksheet', icon: '🖨️', ariaLabel: `Printable worksheet: ${set.label}`, onClick: () => this.routes.worksheet(setId) }));
      }));
    };

    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; draw(); },
    });
    draw();

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Trace Trail' }),
      el('p', { class: 'menu__intro', text: 'Trace letters and numbers with your finger or a stylus. A pencil shows how to write each one first, and a snail follows you along the path. Go slowly and stay on the dots!' }),
      picker.el, el('h2', { class: 'menu__heading', text: 'Choose what to write' }), setsEl,
      el('p', { class: 'menu__note', text: 'Works best on a tablet with a stylus: tracing with a mouse is hard. For real pencil practice, print a worksheet.' })));
  }
}
