import { QuestScene } from './QuestScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { createButton } from '../../../engine/ui/Button.js';
import { LEVELS, LEVEL_IDS } from '../logic/levels.js';
import { CONTINENT_IDS, WORLD_VIEW } from '../logic/continents.js';
import { exploredCodes, summarize } from '../logic/progress.js';
import { createWorldMap } from '../ui/WorldMap.js';

/** The world map hub: how much of each continent is explored, a level, and where to fly next. */
export class WorldScene extends QuestScene {
  #map = null;

  enter() {
    const { services, data } = this;
    const progress = data.progress.load();
    const summary = summarize(progress, data.countries);
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    this.#map = createWorldMap({ world: data.world, label: `World map. You have explored ${summary.world.explored} of ${summary.world.total} countries.` });

    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; },
    });

    const fly = (continent) => {
      services.audio.play('click');
      this.routes.play({ levelId, continent });
    };
    const continents = CONTINENT_IDS.map((id) => {
      const s = summary.continents[id];
      return el('button', { class: 'continent', attrs: { type: 'button', 'aria-label': `${id}: ${s.explored} of ${s.total} countries explored, ${s.percent} percent. Start a trip.` }, on: { click: () => fly(id) } },
        el('span', { class: 'continent__name', text: id }),
        el('span', { class: 'continent__bar', attrs: { 'aria-hidden': 'true' } }, el('span', { class: 'continent__fill', style: { width: `${s.percent}%` } })),
        el('span', { class: 'continent__pct', text: `${s.percent}% explored`, attrs: { 'aria-hidden': 'true' } }));
    });

    this.ui.append(hud.el, el('main', { class: 'hub' },
      el('div', { class: 'hub__map' }, this.#map.el),
      el('p', { class: 'hub__summary', text: `${summary.world.percent}% of the world explored (${summary.world.explored} of ${summary.world.total} countries)` }),
      picker.el,
      el('h2', { class: 'hub__heading', text: 'Where to next?' }),
      el('div', { class: 'continents' }, ...continents),
      el('div', { class: 'hub__actions' },
        createButton({ label: 'Whole world', icon: '🌍', variant: 'primary', onClick: () => fly('world') }),
        createButton({ label: `Passport (${summary.world.explored})`, icon: '📘', onClick: () => this.routes.passport() }))));
    this.#map.setHome(WORLD_VIEW);
    this.#map.setExplored(exploredCodes(progress));
  }

  exit() {
    this.#map?.destroy();
  }
}
