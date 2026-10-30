import { ShopKeeperScene } from './ShopKeeperScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, CUSTOMERS_PER_ROUND } from '../logic/levels.js';
import { generateRound } from '../logic/saleGenerator.js';

/** Menu: choose a level, see your best stars, open the shop for a round of six customers. */
export class MenuScene extends ShopKeeperScene {
  enter() {
    const { services, data } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; },
    });

    const { bestStars } = services.rewards.getSave(services.game.slug);
    const best = el('ul', {}, ...LEVEL_IDS.map((id) => {
      const earned = bestStars[id] ?? 0;
      return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
        el('span', { text: LEVELS[id].label }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
    }));

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Shop Keeper' }),
      el('p', { class: 'menu__intro', text: 'Customers buy things and pay with a note. Work out the change and drag coins and notes into the tray to give it back!' }),
      picker.el,
      el('p', { class: 'menu__note', text: `${CUSTOMERS_PER_ROUND} customers per round. Give change with the fewest pieces for a Smart change star.` }),
      createButton({ label: 'Open the shop', icon: '🛒', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        this.routes.play({ levelId, sales: generateRound(levelId, CUSTOMERS_PER_ROUND, services.rng, data), index: 0, results: [] });
      } }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } }, el('h2', { text: 'Your best' }), best)));
  }
}
