import { QuestScene } from './QuestScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { CONTINENT_IDS } from '../logic/continents.js';
import { exploredCodes, summarize } from '../logic/progress.js';
import { createStampCard } from '../ui/StampCard.js';

/** The passport: a stamp, with its fun fact, for every country explored so far. */
export class PassportScene extends QuestScene {
  enter() {
    const { services, data } = this;
    const progress = data.progress.load();
    const explored = exploredCodes(progress);
    const summary = summarize(progress, data.countries);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const sections = CONTINENT_IDS.map((id) => {
      const stamps = data.countries.filter((c) => c.continent === id && explored.has(c.code)).sort((a, b) => a.name.localeCompare(b.name));
      const s = summary.continents[id];
      return el('section', { class: 'passport__continent', attrs: { 'aria-label': id } },
        el('h2', { text: `${id} (${s.explored} of ${s.total})` }),
        stamps.length
          ? el('div', { class: 'stamps' }, ...stamps.map((c) => createStampCard(c, { broken: data.brokenFlags })))
          : el('p', { class: 'passport__empty', text: 'No stamps here yet.' }));
    });

    this.ui.append(hud.el, el('main', { class: 'passport' },
      el('h1', { text: 'Passport' }),
      el('p', { class: 'passport__total', text: explored.size === 0
        ? 'Your passport is empty. Answer two questions about a country to earn its stamp!'
        : `${explored.size} of ${summary.world.total} countries stamped (${summary.world.percent}%).` }),
      ...sections,
      el('div', { class: 'result__actions' }, createButton({ label: 'World map', icon: '🌍', variant: 'primary', big: true, onClick: () => this.routes.hub() }))));
  }
}
