import { NinjaScene } from './NinjaScene.js';
import { el, clear } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, OP_NAME, OP_SYMBOL } from '../logic/levels.js';

/**
 * Menu: choose a level and which operations to practise, then start.
 * Respects the grown-up difficulty lock (only the locked level can be chosen).
 */
export class MenuScene extends NinjaScene {
  #levelId = 'easy';
  #ops = new Set();
  #opsBox = null;
  #note = null;

  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    this.#levelId = lock ?? 'easy';
    this.#ops = new Set(LEVELS[this.#levelId].ops);

    const hud = createHud({
      homeHref: services.game.homeHref,
      title: services.game.title,
      onSettings: () => services.openSettings(),
    });

    const picker = createLevelPicker({
      value: this.#levelId,
      lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => {
        this.#levelId = level;
        this.#ops = new Set(LEVELS[level].ops);
        this.#note.textContent = '';
        this.#renderOps();
      },
    });

    this.#opsBox = el('div', { class: 'chips menu__ops', attrs: { role: 'group', 'aria-label': 'Operations to practise' } });
    this.#note = el('p', { class: 'message', attrs: { role: 'status' } });
    this.#renderOps();

    const main = el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Number Ninja' }),
      el('p', { class: 'menu__intro', text: 'Stars full of sums fall from the sky. Type the answer and press Enter before they land!' }),
      picker.el,
      el('div', { class: 'menu__ops-wrap' }, el('p', { class: 'field__label', text: 'Practise' }), this.#opsBox, this.#note),
      createButton({ label: 'Start', icon: '▶', variant: 'primary', big: true, onClick: () => this.#start() }),
      this.#buildBestStars());

    this.ui.append(hud.el, main);
  }

  #renderOps() {
    clear(this.#opsBox);
    for (const op of LEVELS[this.#levelId].ops) {
      const chip = el('button', {
        class: 'chip',
        text: `${OP_SYMBOL[op]} ${OP_NAME[op]}`,
        attrs: { type: 'button', 'aria-pressed': String(this.#ops.has(op)) },
        on: {
          click: () => {
            if (this.#ops.has(op) && this.#ops.size === 1) {
              this.#note.textContent = 'Pick at least one kind of sum.';
              return;
            }
            this.#note.textContent = '';
            if (this.#ops.has(op)) this.#ops.delete(op);
            else this.#ops.add(op);
            chip.setAttribute('aria-pressed', String(this.#ops.has(op)));
          },
        },
      });
      this.#opsBox.append(chip);
    }
  }

  /** "Your best" row: the stars saved for each level. */
  #buildBestStars() {
    const { bestStars } = this.services.rewards.getSave(this.services.game.slug);
    const items = LEVEL_IDS.map((id) => {
      const earned = bestStars[id] ?? 0;
      return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
        el('span', { text: LEVELS[id].label }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
    });
    return el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } },
      el('h2', { text: 'Your best' }), el('ul', {}, ...items));
  }

  #start() {
    this.services.audio.play('click');
    this.routes.play({ levelId: this.#levelId, ops: [...this.#ops] });
  }
}
