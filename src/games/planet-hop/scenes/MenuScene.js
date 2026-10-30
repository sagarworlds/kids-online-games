import { HopScene } from './HopScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, MODES, MODE_IDS, levelKey } from '../logic/levels.js';
import { rankFor } from '../logic/scoring.js';

/** Menu: your rank, a level, and the three ways to play (with the stars you have for each at this level). */
export class MenuScene extends HopScene {
  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const modesEl = el('div', { class: 'modes' });
    const drawModes = () => {
      const { bestStars } = services.rewards.getSave(services.game.slug);
      modesEl.replaceChildren(...MODE_IDS.map((mode) => {
        const earned = bestStars[levelKey(mode, levelId)] ?? 0;
        return el('button', {
          class: 'mode', attrs: { type: 'button', 'aria-label': `${MODES[mode].label}. ${MODES[mode].blurb}. ${earned} of 3 stars at ${LEVELS[levelId].label}.` },
          on: { click: () => { services.audio.play('click'); this.routes.play({ mode, levelId }); } },
        },
        el('span', { class: 'mode__icon', text: MODES[mode].icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'mode__label', text: MODES[mode].label }),
        el('span', { class: 'mode__blurb', text: MODES[mode].blurb }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned), attrs: { 'aria-hidden': 'true' } }));
      }));
    };
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; drawModes(); },
    });
    drawModes();

    const total = services.rewards.starsFor(services.game.slug);
    const { rank, next, starsToNext } = rankFor(total);
    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Planet Hop' }),
      el('p', { class: 'menu__intro', text: 'Put the planets in order, find out how heavy you would feel on each one, and test what you know!' }),
      el('p', { class: 'menu__rank' }, el('strong', { text: `Rank: ${rank.label}` }), next ? ` (${starsToNext} more ${starsToNext === 1 ? 'star' : 'stars'} to ${next.label})` : ' (the top rank!)'),
      picker.el, modesEl));
  }
}
