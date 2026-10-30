import { PizzaScene } from './PizzaScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, CUSTOMERS_PER_ROUND } from '../logic/levels.js';
import { generateRound } from '../logic/orderGenerator.js';

/** Menu: choose a level, see your best stars, open the shop for a round of eight customers. */
export class MenuScene extends PizzaScene {
  enter() {
    const { services } = this;
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
      el('h1', { class: 'menu__title', text: 'Pizza Fractions' }),
      el('p', { class: 'menu__intro', text: 'Customers order a fraction of a pizza, like 3/8 pepperoni. Pick a topping and tap slices to cover exactly that much!' }),
      picker.el,
      el('p', { class: 'menu__note', text: `${CUSTOMERS_PER_ROUND} customers per round. Get it right the first time to earn the most coins.` }),
      createButton({ label: 'Open the shop', icon: '🍕', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        this.routes.play({ levelId, orders: generateRound(levelId, CUSTOMERS_PER_ROUND, services.rng), index: 0, results: [] });
      } }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } }, el('h2', { text: 'Your best' }), best)));
  }
}
