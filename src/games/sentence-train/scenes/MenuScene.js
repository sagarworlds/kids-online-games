import { TrainScene } from './TrainScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { createButton } from '../../../engine/ui/Button.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, SENTENCES_PER_ROUND, HINTS_PER_ROUND } from '../logic/levels.js';
import { sentencesFor, pickSentences } from '../logic/sentences.js';

/** Menu: choose a level, see your best stars, and start a round of eight sentences. */
export class MenuScene extends TrainScene {
  enter() {
    const { services, data } = this;
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
      el('h1', { class: 'menu__title', text: 'Sentence Train' }),
      el('p', { class: 'menu__intro', text: 'The word carriages are all mixed up! Drag them behind the engine in the right order, then blow the whistle.' }),
      picker.el,
      el('p', { class: 'menu__note', text: `${SENTENCES_PER_ROUND} sentences per round, ${HINTS_PER_ROUND} hints. The first word has a capital letter and the last one has the full stop or question mark.` }),
      createButton({ label: 'All aboard', icon: '🚂', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        const entries = pickSentences(sentencesFor(data, levelId), services.rng);
        this.routes.play({ levelId, entries, index: 0, results: [], hintsLeft: HINTS_PER_ROUND });
      } }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } }, el('h2', { text: 'Your best' }), best)));
  }
}
