import { RacingScene } from './RacingScene.js';
import { el, clear } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, RACE_LENGTH } from '../logic/levels.js';
import { loadGhost, tablesKey } from '../logic/saveData.js';
import { ghostFinishMs } from '../logic/ghost.js';
import { formatTime } from '../logic/scoring.js';

/** Menu: choose a level and which tables to practise ("Mixed" is all of the level's tables), then race. */
export class MenuScene extends RacingScene {
  #levelId = 'easy';
  #tables = new Set();
  #tablesBox = null;
  #note = null;
  #bestEl = null;

  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    this.#levelId = lock ?? 'easy';
    this.#tables = new Set(LEVELS[this.#levelId].tables);

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const picker = createLevelPicker({
      value: this.#levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => {
        this.#levelId = level;
        this.#tables = new Set(LEVELS[level].tables);
        this.#note.textContent = '';
        this.#renderTables();
      },
    });

    this.#tablesBox = el('div', { class: 'chips menu__tables', attrs: { role: 'group', 'aria-label': 'Tables to practise' } });
    this.#note = el('p', { class: 'message', attrs: { role: 'status' } });
    this.#bestEl = el('p', { class: 'menu__best-time', attrs: { role: 'status' } });
    this.#renderTables();

    const { bestStars } = services.rewards.getSave(services.game.slug);
    const best = el('ul', {}, ...LEVEL_IDS.map((id) => {
      const earned = bestStars[id] ?? 0;
      return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
        el('span', { text: LEVELS[id].label }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
    }));

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Times-Table Racing' }),
      el('p', { class: 'menu__intro', text: `Answer ${RACE_LENGTH} multiplication questions to drive across the finish line. Race the ghost of your own best run!` }),
      picker.el,
      el('div', { class: 'menu__tables-wrap' }, el('p', { class: 'field__label', text: 'Practise these tables' }), this.#tablesBox, this.#note),
      this.#bestEl,
      createButton({ label: 'Start race', icon: '🏁', variant: 'primary', big: true, onClick: () => this.#start() }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } }, el('h2', { text: 'Your best' }), best)));
  }

  #chip(label, pressed, onClick) {
    return el('button', { class: 'chip', text: label, attrs: { type: 'button', 'aria-pressed': String(pressed) }, on: { click: onClick } });
  }

  #renderTables() {
    const level = LEVELS[this.#levelId];
    clear(this.#tablesBox);
    const allSelected = this.#tables.size === level.tables.length;
    this.#tablesBox.append(this.#chip('Mixed', allSelected, () => {
      this.#tables = new Set(level.tables);
      this.#note.textContent = '';
      this.#renderTables();
    }));
    for (const table of level.tables) {
      this.#tablesBox.append(this.#chip(`${table}×`, this.#tables.has(table), () => {
        if (this.#tables.has(table) && this.#tables.size === 1) {
          this.#note.textContent = 'Pick at least one table.';
          return;
        }
        this.#note.textContent = '';
        if (this.#tables.has(table)) this.#tables.delete(table);
        else this.#tables.add(table);
        this.#renderTables();
      }));
    }
    this.#renderBest();
  }

  /** The best time for this exact choice of level and tables, so the child knows what the ghost will be. */
  #renderBest() {
    const level = LEVELS[this.#levelId];
    const tables = [...this.#tables].sort((a, b) => a - b);
    const { run, isDefault } = loadGhost(this.services.rewards.getSave(this.services.game.slug).extra, level.id, tablesKey(tables, level), level.ghostPaceMs);
    this.#bestEl.textContent = isDefault
      ? `No race here yet: you will race a starter ghost (one answer every ${level.ghostPaceMs / 1000} s).`
      : `Your best time here: ${formatTime(ghostFinishMs(run))}. That is the ghost you will race.`;
  }

  #start() {
    this.services.audio.play('click');
    this.routes.play({ levelId: this.#levelId, tables: [...this.#tables].sort((a, b) => a - b) });
  }
}
