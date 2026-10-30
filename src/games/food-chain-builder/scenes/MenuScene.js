import { FoodScene } from './FoodScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS } from '../logic/levels.js';
import { readLearned } from '../logic/learned.js';
import { findHabitat } from '../logic/habitats.js';

/** Habitat select: choose a level, then a place. Each place shows how many living things it has and your best stars. */
export class MenuScene extends FoodScene {
  enter() {
    const { services, data } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    const save = services.rewards.getSave(services.game.slug);
    const learned = readLearned(save.extra, data.organisms.map((o) => o.id));

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const placesEl = el('div', { class: 'places' });
    const drawPlaces = () => {
      placesEl.replaceChildren(...data.places.map((place) => {
        const habitat = findHabitat(data.habitats, place.id, levelId);
        const earned = save.bestStars[habitat.id] ?? 0;
        return el('button', {
          class: `place place--${place.id}`, attrs: { type: 'button', 'aria-label': `${place.name}. ${habitat.organisms.length} living things. ${earned} of 3 stars at ${LEVELS[levelId].label}.` },
          on: { click: () => { services.audio.play('click'); this.routes.build({ habitatId: habitat.id }); } },
        },
        el('span', { class: 'place__icon', text: place.icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'place__name', text: place.name }),
        el('span', { class: 'place__count', text: `${habitat.organisms.length} living things` }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned), attrs: { 'aria-hidden': 'true' } }));
      }));
    };
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; drawPlaces(); },
    });
    drawPlaces();

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Food Chain Builder' }),
      el('p', { class: 'menu__intro', text: 'Who eats whom? Draw arrows from each food to the one that eats it, and watch the food web come alive!' }),
      el('p', { class: 'menu__learned', text: `Living things you have met: ${learned.size} of ${data.organisms.length}` }),
      picker.el, el('h2', { class: 'menu__heading', text: 'Choose a habitat' }), placesEl));
  }
}
