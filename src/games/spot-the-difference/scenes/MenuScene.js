import { SpotBase, MIX } from './SpotBase.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, SCENES_PER_ROUND, roundKey } from '../logic/levels.js';

/** Menu: pick a level, then a theme to play. Each card shows your best stars for that theme at that level. */
export class MenuScene extends SpotBase {
  enter() {
    const { services, data } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    const { bestStars } = services.rewards.getSave(services.game.slug);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const cardsEl = el('div', { class: 'themes' });
    const choices = [...[...data.themes.values()].map((t) => ({ id: t.id, name: t.name, icon: t.icon })), { id: MIX, name: 'Mix of everything', icon: '🎲' }];

    const drawCards = () => {
      cardsEl.replaceChildren(...choices.map((choice) => {
        const earned = bestStars[roundKey(choice.id, levelId)] ?? 0;
        return el('button', {
          class: 'theme', attrs: { type: 'button', 'aria-label': `${choice.name}. ${earned} of 3 stars at ${LEVELS[levelId].label}.` },
          on: { click: () => { services.audio.play('click'); this.routes.play({ themeId: choice.id, levelId }); } },
        },
        el('span', { class: 'theme__icon', text: choice.icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'theme__name', text: choice.name }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned), attrs: { 'aria-hidden': 'true' } }));
      }));
    };

    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; drawCards(); },
    });
    drawCards();

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Spot the Difference' }),
      el('p', { class: 'menu__intro', text: `Two pictures look the same, but they are not! Tap the differences. Find them all in ${SCENES_PER_ROUND} pictures to win stars.` }),
      picker.el,
      el('h2', { class: 'menu__heading', text: 'Choose a place' }),
      cardsEl));
  }
}
