import { PlantScene } from './PlantScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, roundKey } from '../logic/levels.js';
import { plantsFor } from '../logic/plants.js';

/** Seed picker: choose a level, then a seed. Seeds that belong to a harder level are shown, but wait for that level. */
export class MenuScene extends PlantScene {
  enter() {
    const { services, data } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    const { bestStars } = services.rewards.getSave(services.game.slug);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const seedsEl = el('div', { class: 'seeds' });
    const drawSeeds = () => {
      const open = new Set(plantsFor(data.plants, levelId).map((p) => p.id));
      seedsEl.replaceChildren(...data.plants.map((plant) => {
        const earned = bestStars[roundKey(plant.id, levelId)] ?? 0;
        const unlocked = open.has(plant.id);
        const card = el('button', {
          class: `seed${unlocked ? '' : ' is-locked'}`, attrs: { type: 'button', 'aria-disabled': !unlocked, 'aria-label': unlocked ? `${plant.name} seed. ${earned} of 3 stars at ${LEVELS[levelId].label}.` : `${plant.name} seed, available at ${LEVELS[plant.unlock].label} level.` },
          on: { click: () => { if (!unlocked) return; services.audio.play('click'); this.routes.play({ plantId: plant.id, levelId }); } },
        },
        el('span', { class: 'seed__icon', text: plant.icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'seed__name', text: plant.name }),
        unlocked
          ? el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned), attrs: { 'aria-hidden': 'true' } })
          : el('span', { class: 'seed__lock', text: `🔒 ${LEVELS[plant.unlock].label} level` }),
        el('span', { class: 'seed__fact', text: plant.fact }));
        return card;
      }));
    };
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; drawSeeds(); },
    });
    drawSeeds();

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Plant Grower' }),
      el('p', { class: 'menu__intro', text: 'Grow a plant from a seed to a flower in 7 days. Give it the right water, sunlight and fertiliser: too little or too much makes it droop!' }),
      picker.el, el('h2', { class: 'menu__heading', text: 'Choose a seed' }), seedsEl));
  }
}
