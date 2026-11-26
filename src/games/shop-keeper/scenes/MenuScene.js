import { ShopKeeperScene } from './ShopKeeperScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { startingLevel } from '../../../engine/utils/recommendLevel.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, CUSTOMERS_PER_ROUND } from '../logic/levels.js';
import { generateRound } from '../logic/saleGenerator.js';
import { starsKey } from '../logic/sale.js';

const INTRO = 'Customers buy things and pay with a note. Work out the change and drag coins and notes into the tray to give it back!';
const SALE_INTRO = 'It is Sale day! Every price tag has a percent off. Take the discount off, add up the bill, then give the change.';

/** Menu: choose a level, and Sale day or not, see your best stars, open the shop for a round of six customers. */
export class MenuScene extends ShopKeeperScene {
  enter() {
    const { services, data } = this;
    const slug = services.game.slug;
    const lock = services.settings.difficultyLock;
    let saleDay = false;

    // The stars of Sale day are kept apart from the others (`starsKey`), so what the menu points out and shows follows the choice.
    const starsIn = () => {
      const { bestStars } = services.rewards.getSave(slug);
      return (id) => bestStars[starsKey(id, saleDay)] ?? 0;
    };
    // Open on the level the child is ready for (a grown-up's lock still decides). Changing to Sale day keeps the level the child has chosen
    // and only moves the pointer.
    let levelId = startingLevel({ lock, levels: LEVEL_IDS, starsAt: starsIn() }).level;

    const intro = el('p', { class: 'menu__intro', text: INTRO });
    const pickerHost = el('div');
    const bestHost = el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } });

    const renderLevels = () => {
      const starsAt = starsIn();
      const start = startingLevel({ lock, levels: LEVEL_IDS, starsAt });
      pickerHost.replaceChildren(createLevelPicker({
        suggested: start.suggested, value: levelId, lock,
        hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, saleDay ? LEVELS[id].sale.blurb : LEVELS[id].blurb])),
        onChange: (level) => { levelId = level; },
      }).el);
      bestHost.replaceChildren(el('h2', { text: saleDay ? 'Your best on Sale day' : 'Your best' }), el('ul', {}, ...LEVEL_IDS.map((id) => {
        const earned = starsAt(id);
        return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
          el('span', { text: LEVELS[id].label }),
          el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
      })));
    };
    const chooseSaleDay = (on) => {
      saleDay = on;
      intro.textContent = on ? SALE_INTRO : INTRO;
      renderLevels();
    };
    renderLevels();

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const saleInput = el('input', { attrs: { type: 'checkbox', id: 'sale-day' }, on: { change: () => chooseSaleDay(saleInput.checked) } });

    this.ui.append(hud.el, el('div', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Shop Keeper' }),
      intro,
      pickerHost,
      el('label', { class: 'toggle menu__sale', attrs: { for: 'sale-day' } }, saleInput, el('span', { text: 'Sale day: prices have a percent off' })),
      el('p', { class: 'menu__note', text: `${CUSTOMERS_PER_ROUND} customers per round. Give change with the fewest pieces for a Smart change star.` }),
      createButton({ label: 'Open the shop', icon: '🛒', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        this.routes.play({ levelId, saleDay, sales: generateRound(levelId, CUSTOMERS_PER_ROUND, services.rng, data, { saleDay }), index: 0, results: [] });
      } }),
      bestHost));
  }
}
