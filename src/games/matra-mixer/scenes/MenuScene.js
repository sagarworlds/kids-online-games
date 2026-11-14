import { MatraBase } from './MatraBase.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createLevelPicker } from '../../../engine/ui/LevelPicker.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { LEVELS, LEVEL_IDS, roundKey } from '../logic/levels.js';
import { LANGS, LANG_IDS, VOWEL_SETS, VOWEL_SET_IDS } from '../logic/devanagari.js';

const ACTIVITIES = Object.freeze([
  { id: 'build', icon: '🔧', title: 'Build the sound', text: 'Hear a sound, then pick the letter and the vowel sign that make it.' },
  { id: 'bubbles', icon: '🫧', title: 'Bubble pop', text: 'Hear a syllable and pop the bubble that says it.' },
  { id: 'words', icon: '🔤', title: 'Read words', text: 'Read a short word and pick its picture.' },
]);

let groupId = 0;

/** Menu: the language and vowel signs (for a grown-up), a level, and the four ways to learn. */
export class MenuScene extends MatraBase {
  enter() {
    const { services } = this;
    const lock = services.settings.difficultyLock;
    let levelId = lock ?? 'easy';
    const hud = createHud({ homeHref: services.game.homeHref, title: services.game.title, onSettings: () => services.openSettings() });
    const cardsEl = el('div', { class: 'activities' });

    const draw = () => {
      const { lang } = this.prefs();
      const { bestStars } = services.rewards.getSave(services.game.slug);
      const card = (icon, title, text, stars, onClick) => el('button', { class: 'activity', attrs: { type: 'button' }, on: { click: () => { services.audio.play('click'); onClick(); } } },
        el('span', { class: 'activity__icon', text: icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'activity__title', text: title }),
        el('span', { class: 'activity__text', text }),
        stars === null ? null : el('span', { class: 'menu__stars', html: ICONS.star.repeat(stars) + ICONS.starEmpty.repeat(3 - stars), attrs: { role: 'img', 'aria-label': `${stars} out of 3 stars` } }));
      cardsEl.replaceChildren(
        card('📖', 'Learn', 'See and hear every syllable on the chart, and mix your own at the matra station.', null, () => this.routes.learn()),
        ...ACTIVITIES.map((a) => card(a.icon, a.title, a.text, bestStars[roundKey(a.id, lang, levelId)] ?? 0, () => this.routes.run({ activity: a.id, levelId }))));
    };

    const picker = createLevelPicker({
      value: levelId, lock,
      hints: Object.fromEntries(LEVEL_IDS.map((id) => [id, LEVELS[id].blurb])),
      onChange: (level) => { levelId = level; draw(); },
    });
    draw();

    this.ui.append(hud.el, el('div', { class: 'menu' },
      el('h1', { class: 'menu__title', text: 'Matra Mixer' }),
      el('p', { class: 'menu__intro', text: 'A consonant train pulls into the matra station. Add a vowel sign to a letter and hear the syllable it makes: क + ा = का.' }),
      this.#prefsPanel(draw), picker.el, el('h2', { class: 'menu__heading', text: 'Choose an activity' }), cardsEl));
  }

  /** Language and vowel signs. They are choices for a grown-up: the vowel signs depend on what the school teaches. */
  #prefsPanel(onChange) {
    const { services } = this;
    const id = `prefs-${groupId++}`;
    const save = (patch) => {
      services.rewards.update(services.game.slug, (data) => { data.extra = { ...data.extra, prefs: { ...this.prefs(), ...patch } }; });
      onChange();
    };
    const group = (field, legend, options) => el('fieldset', { class: 'prefs__group' },
      el('legend', { text: legend }),
      ...options.map(({ value, label, note }) => {
        const input = el('input', { attrs: { type: 'radio', name: `${id}-${field}`, id: `${id}-${field}-${value}`, value, checked: this.prefs()[field] === value }, on: { change: () => save({ [field]: value }) } });
        return el('div', { class: 'segmented__item' }, input, el('label', { attrs: { for: `${id}-${field}-${value}` } }, el('span', { text: label }), el('small', { text: note })));
      }));
    return el('details', { class: 'prefs' },
      el('summary', { text: '⚙️ Language and vowel signs' }),
      group('lang', 'Language', LANG_IDS.map((l) => ({ value: l, label: LANGS[l].label, note: l === 'hi' ? 'Hindi words and voice' : 'Marathi words and voice' }))),
      group('vowelSet', 'Vowel signs', VOWEL_SET_IDS.map((v) => ({ value: v, label: VOWEL_SETS[v].label, note: VOWEL_SETS[v].blurb }))),
      el('p', { class: 'prefs__note', text: 'Check which one your child\'s school teaches: Marathi बाराखडी and the longer चौदाखडी (which adds ॅ and ॉ) differ.' }));
  }
}
