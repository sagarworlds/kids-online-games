import { HindiScene } from './HindiScene.js';
import { el, spaced } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { startingLevel } from '../../../engine/utils/recommendLevel.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LANGUAGES, LANGUAGE_IDS, getLanguage, levelKey, readLanguage, withLanguage } from '../logic/languages.js';
import { LEVELS, LEVEL_IDS, MIXED, PEEK_SECONDS } from '../logic/levels.js';

/** Menu: choose a language (Hindi or Marathi), a topic, a level, and whether to peek at all the cards first. */
export class MenuScene extends HindiScene {
  enter() {
    const { services, data } = this;
    const slug = services.game.slug;
    const lock = services.settings.difficultyLock;
    let language = readLanguage(services.rewards.getSave(slug).extra);
    let topic = MIXED;

    // The stars a child has are kept per language (Hindi under the plain level ids), so what the menu points out and shows follows the language.
    const starsIn = () => {
      const { bestStars } = services.rewards.getSave(slug);
      return (id) => bestStars[levelKey(language, id)] ?? 0;
    };
    // Open on the level the child is ready for (a grown-up's lock still decides); the picker points it out. Changing the language later
    // keeps the level the child has chosen and only moves the pointer.
    let levelId = startingLevel({ lock, levels: LEVEL_IDS, starsAt: starsIn() }).level;

    const intro = el('p', { class: 'menu__intro' });
    const pickerHost = el('div');
    const bestHost = el('section', { class: 'menu__best', attrs: { 'aria-label': 'Your best stars' } });

    const renderIntro = () => {
      const { name, example, id } = getLanguage(language);
      intro.replaceChildren(`Flip two cards to find a ${name} word and its English meaning, like `,
        el('span', { class: 'indic', text: example, attrs: { lang: id } }), ' and Apple.');
    };
    const renderLevels = () => {
      const starsAt = starsIn();
      const start = startingLevel({ lock, levels: LEVEL_IDS, starsAt });
      pickerHost.replaceChildren(createLevelPicker({
        suggested: start.suggested, value: levelId, lock,
        hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
        onChange: (level) => { levelId = level; },
      }).el);
      bestHost.replaceChildren(el('h2', { text: 'Your best' }), el('ul', {}, ...LEVEL_IDS.map((id) => {
        const earned = starsAt(id);
        return el('li', { attrs: { 'aria-label': `${LEVELS[id].label}: ${earned} of 3 stars` } },
          el('span', { text: LEVELS[id].label }),
          el('span', { class: 'menu__stars', html: ICONS.star.repeat(earned) + ICONS.starEmpty.repeat(3 - earned) }));
      })));
    };
    const chooseLanguage = (id) => {
      language = id;
      services.rewards.update(slug, (save) => { save.extra = withLanguage(save.extra, id); });
      renderIntro();
      renderLevels();
    };
    renderIntro();
    renderLevels();

    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });

    const languageSet = el('fieldset', { class: 'segmented' }, el('legend', { text: 'Language' }),
      ...LANGUAGE_IDS.map((id) => {
        const inputId = `language-${id}`;
        return el('div', { class: 'segmented__item segmented__item--small' },
          el('input', { attrs: { type: 'radio', name: 'language', id: inputId, value: id, checked: id === language }, on: { change: () => chooseLanguage(id) } }),
          // The name in the language's own script says which is which to a child who reads it, and carries its language for a screen reader.
          el('label', { attrs: { for: inputId } }, ...spaced(el('span', { text: LANGUAGES[id].name }), el('small', { text: LANGUAGES[id].label, attrs: { lang: id } }))));
      }));

    const topicSet = el('fieldset', { class: 'segmented' }, el('legend', { text: 'Topic' }),
      ...[MIXED, ...data.topics].map((name, i) => {
        const id = `topic-${i}`;
        return el('div', { class: 'segmented__item segmented__item--small' },
          el('input', { attrs: { type: 'radio', name: 'topic', id, value: name, checked: name === topic }, on: { change: () => { topic = name; } } }),
          el('label', { attrs: { for: id } }, el('span', { text: name })));
      }));

    const peek = el('input', { attrs: { type: 'checkbox', id: 'peek' } });

    this.ui.append(hud.el, el('div', { class: 'menu' },
      el('h1', { class: 'menu__title' }, el('span', { text: 'Hindi–English Match' })),
      intro, languageSet, pickerHost, topicSet,
      el('label', { class: 'toggle menu__peek', attrs: { for: 'peek' } }, peek, el('span', { text: `Practice: show all cards for ${PEEK_SECONDS} seconds first` })),
      createButton({ label: 'Start', icon: '▶', variant: 'primary', big: true, onClick: () => {
        services.audio.play('click');
        this.routes.play({ levelId, topic, peek: peek.checked, language });
      } }),
      bestHost));
  }
}
