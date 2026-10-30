import { SimonScene } from './SimonScene.js';
import { el, clear } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, MODES } from '../logic/levels.js';

/** Menu: pick a level and a mode (Classic, Reverse on Hard, or Music Maker). */
export class MenuScene extends SimonScene {
  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    let mode = 'classic';
    const modesBox = el('fieldset', { class: 'segmented' });

    const renderModes = () => {
      clear(modesBox);
      if (mode === 'reverse' && !LEVELS[levelId].reverse) mode = 'classic'; // Reverse is a Hard mode
      modesBox.append(el('legend', { text: 'Mode' }), ...MODES.map((m) => {
        const id = `mode-${m.id}`;
        const blocked = m.id === 'reverse' && !LEVELS[levelId].reverse;
        const input = el('input', { attrs: { type: 'radio', name: 'mode', id, value: m.id, checked: mode === m.id, disabled: blocked },
          on: { change: () => { mode = m.id; } } });
        return el('div', { class: 'segmented__item' }, input,
          el('label', { attrs: { for: id } }, el('span', { text: m.label }), el('small', { text: blocked ? 'Hard level only' : m.blurb })));
      }));
    };

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; renderModes(); },
    });
    renderModes();

    const { bestStars, extra } = services.rewards.getSave(services.game.slug);
    const bestLength = extra.bestLength ?? {};
    const best = el('ul', {}, ...LEVEL_IDS.map((id) => {
      const earned = bestStars[id] ?? 0;
      return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars, best ${bestLength[id] ?? 0}` } },
        el('span', { text: LEVELS[id].label }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }),
        el('small', { text: `longest ${bestLength[id] ?? 0}` }));
    }));

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Simon Says' }),
      el('p', { class: 'menu__intro', text: 'Watch the pads light up, listen to the notes, then play them back. Every round adds one more!' }),
      picker.el, modesBox,
      createButton({ label: 'Start', icon: '▶', variant: 'primary', big: true, onClick: () => {
        services.audio.unlock(); // browsers only start audio after a tap
        services.audio.play('click');
        if (mode === 'music') this.routes.music({ levelId });
        else this.routes.play({ levelId, mode });
      } }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best' } }, el('h2', { text: 'Your best' }), best)));
  }
}
