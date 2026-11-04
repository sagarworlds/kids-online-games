import { TowerBase } from './TowerBase.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, floorsOf, floorKey, isFloorOpen, CLEAR_STARS } from '../logic/levels.js';
import { trickFor } from '../logic/splits.js';
import { dueKeys } from '../logic/memory.js';

/** The tower: pick a level, then a floor (the top floor is drawn at the top). Revision sits above it. */
export class MenuScene extends TowerBase {
  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? this.#startLevel();
    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const revisionEl = el('div', { class: 'revision' });
    const towerEl = el('ol', { class: 'tower', attrs: { 'aria-label': 'The tower, top floor first' } });

    const draw = () => {
      const { bestStars } = this.save;
      const cleared = this.cleared();
      towerEl.replaceChildren(...[...floorsOf(LEVELS[levelId])].reverse().map((floor) => {
        const open = isFloorOpen(floor, cleared);
        const stars = bestStars[floorKey(floor)] ?? 0;
        const done = cleared.has(floor);
        const label = open
          ? `Floor ${floor}, the ${floor} times table. ${stars} of 3 stars.${done ? ' Cleared.' : ''}${trickFor(floor) ? ' Has a trick.' : ''}`
          : `Floor ${floor}, locked. Clear floor ${floor - 1} first.`;
        const button = el('button', {
          class: `floor${open ? '' : ' is-locked'}${done ? ' is-cleared' : ''}`, attrs: { type: 'button', 'aria-disabled': String(!open), 'aria-label': label },
          on: { click: () => { if (!open) return; services.audio.play('click'); this.routes.floor(floor); } },
        },
        el('span', { class: 'floor__number', text: String(floor) }),
        el('span', { class: 'floor__name', text: `× ${floor} table` }),
        trickFor(floor) ? el('span', { class: 'floor__trick', text: '✨ Trick' }) : null,
        open
          ? el('span', { class: 'menu__stars', html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars), attrs: { 'aria-hidden': 'true' } })
          : el('span', { class: 'floor__lock', text: '🔒' }));
        return el('li', {}, button);
      }));
      this.#drawRevision(revisionEl, levelId);
    };

    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; draw(); },
    });
    draw();

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Table Tower' }),
      el('p', { class: 'menu__intro', text: `Climb the tower: every floor is one times table. Get ${CLEAR_STARS} stars in a floor's Challenge to open the next floor.` }),
      picker.el, revisionEl,
      el('h2', { class: 'menu__heading', text: 'Choose a floor' }), towerEl));
  }

  /** The level to show first: the one with the highest floor cleared so far, so a returning child lands where they were. */
  #startLevel() {
    const cleared = [...this.cleared()];
    const top = cleared.length ? Math.max(...cleared) : 1;
    return LEVEL_IDS.find((id) => top + 1 <= LEVELS[id].lastFloor) ?? 'hard';
  }

  #drawRevision(box, levelId) {
    const memory = this.memory();
    const known = Object.keys(memory).length;
    const due = dueKeys(memory, this.today()).length;
    const text = known === 0
      ? 'Revision opens after your first Challenge or Revision. It brings back the facts you find hard.'
      : due > 0 ? `${due} ${due === 1 ? 'fact is' : 'facts are'} ready to revise.` : 'All caught up! Practise anyway to keep facts fresh.';
    box.replaceChildren(
      el('p', { class: 'revision__text', text }),
      createButton({
        label: 'Revision', icon: '🔁', variant: 'accent', disabled: known === 0,
        onClick: () => { this.services.audio.play('click'); this.routes.quiz({ mode: 'revision', levelId }); },
      }));
  }
}
