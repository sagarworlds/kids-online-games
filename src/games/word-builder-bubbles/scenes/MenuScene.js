import { BubblesScene } from './BubblesScene.js';
import { el, clear } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, WORDS_PER_ROUND, HINTS_PER_ROUND } from '../logic/levels.js';
import { wordsFor, pickWords } from '../logic/words.js';

/** Menu: choose a word pack and a level, then start a round of ten words. */
export class MenuScene extends BubblesScene {
  #packId = null;
  #packsBox = null;

  enter() {
    const { services, data } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    this.#packId = data.packs[0].id;

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; },
    });
    this.#packsBox = el('div', { class: 'chips menu__packs', attrs: { role: 'group', 'aria-label': 'Word pack' } });
    this.#renderPacks();

    const { bestStars } = services.rewards.getSave(services.game.slug);
    const best = el('ul', {}, ...LEVEL_IDS.map((id) => {
      const earned = bestStars[id] ?? 0;
      return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
        el('span', { text: LEVELS[id].label }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
    }));

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Word Builder Bubbles' }),
      el('p', { class: 'menu__intro', text: `Look at the picture and the clue, then pop the bubbles in the right order to spell the word. ${WORDS_PER_ROUND} words per round, ${HINTS_PER_ROUND} hints.` }),
      picker.el,
      el('div', { class: 'menu__packs-wrap' }, el('p', { class: 'field__label', text: 'Word pack' }), this.#packsBox),
      createButton({ label: 'Start', icon: '🫧', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        const words = pickWords(wordsFor(data, this.#packId, levelId), services.rng);
        this.routes.play({ levelId, packId: this.#packId, words, index: 0, results: [], hintsLeft: HINTS_PER_ROUND });
      } }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } }, el('h2', { text: 'Your best' }), best)));
  }

  #renderPacks() {
    clear(this.#packsBox);
    for (const pack of this.data.packs) {
      this.#packsBox.append(el('button', {
        class: 'chip', text: `${pack.icon} ${pack.name}`,
        attrs: { type: 'button', 'aria-pressed': String(pack.id === this.#packId) },
        on: { click: () => { this.#packId = pack.id; this.#renderPacks(); } },
      }));
    }
  }
}
