import { HindiScene } from './HindiScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, MIXED, PEEK_SECONDS } from '../logic/levels.js';

/** Menu: choose a topic, a level, and whether to peek at all the cards first. */
export class MenuScene extends HindiScene {
  enter() {
    const { services, data } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    let topic = MIXED;

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; },
    });

    const topicSet = el('fieldset', { class: 'segmented' }, el('legend', { text: 'Topic' }),
      ...[MIXED, ...data.topics].map((name, i) => {
        const id = `topic-${i}`;
        return el('div', { class: 'segmented__item segmented__item--small' },
          el('input', { attrs: { type: 'radio', name: 'topic', id, value: name, checked: name === topic }, on: { change: () => { topic = name; } } }),
          el('label', { attrs: { for: id } }, el('span', { text: name })));
      }));

    const peek = el('input', { attrs: { type: 'checkbox', id: 'peek' } });
    const { bestStars } = services.rewards.getSave(services.game.slug);
    const best = el('ul', {}, ...LEVEL_IDS.map((id) => {
      const earned = bestStars[id] ?? 0;
      return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
        el('span', { text: LEVELS[id].label }),
        el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
    }));

    this.ui.append(hud.el, el('main', { class: 'menu' },
      el('h1', { class: 'menu__title' }, el('span', { text: 'Hindi–English Match' })),
      el('p', { class: 'menu__intro' }, 'Flip two cards to find a Hindi word and its English meaning, like ',
        el('span', { class: 'hi', text: 'सेब', attrs: { lang: 'hi' } }), ' and Apple.'),
      picker.el, topicSet,
      el('label', { class: 'toggle menu__peek', attrs: { for: 'peek' } }, peek, el('span', { text: `Practice: show all cards for ${PEEK_SECONDS} seconds first` })),
      createButton({ label: 'Start', icon: '▶', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        this.routes.play({ levelId, topic, peek: peek.checked });
      } }),
      el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } }, el('h2', { text: 'Your best' }), best)));
  }
}
