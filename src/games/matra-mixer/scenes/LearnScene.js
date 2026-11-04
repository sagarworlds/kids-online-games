import { MatraBase } from './MatraBase.js';
import { el } from '../../../engine/utils/dom.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { signOnItsOwn } from '../logic/devanagari.js';
import { syllableParts } from '../logic/audio.js';
import { createLearnGrid } from '../ui/LearnGrid.js';
import { createMixer } from '../ui/Mixer.js';

/** Learn: the chart (tap any cell to see and hear it) and the matra station (drag a vowel sign onto a letter). */
export class LearnScene extends MatraBase {
  #view = 'grid';
  #grid = null;
  #mixer = null;
  #detail = null;
  #stage = null;
  #tabs = {};
  #picked = null;

  enter() {
    const { services } = this;
    // The chart shows everything for the saved language and vowel signs, whatever the level.
    this.content = this.contentFor('hard');
    const hud = createHud({ homeHref: services.game.homeHref, title: 'Learn the matras', onSettings: () => services.openSettings() });
    this.#detail = el('div', { class: 'detail', attrs: { 'aria-live': 'polite' } });
    this.#stage = el('div', { class: 'learn__stage' });
    this.#grid = createLearnGrid({ content: this.content, onPick: (syllable) => this.#pick(syllable) });
    this.#mixer = createMixer({ content: this.content, onMix: (consonant, sign) => this.#pick(this.content.syllables.find((s) => s.consonant === consonant && s.sign === sign)) });
    const tab = (id, label) => {
      const button = el('button', { class: 'tab', text: label, attrs: { type: 'button', role: 'tab' }, on: { click: () => this.#switch(id) } });
      this.#tabs[id] = button;
      return button;
    };
    this.ui.append(hud.el, el('main', { class: 'learn' },
      el('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'How to learn' } }, tab('grid', '📋 Chart'), tab('mixer', '🚂 Matra station')),
      services.settings.sound ? null : el('p', { class: 'learn__muted', text: '🔇 Sound is off in the grown-ups settings, so syllables will not be spoken.' }),
      this.#detail, this.#stage,
      el('div', { class: 'run__actions' }, createButton({ label: 'Back to the menu', icon: '🏠', onClick: () => this.routes.menu() }))));
    this.#detailEmpty();
    this.#switch('grid');
  }

  exit() {
    this.#mixer?.destroy();
    super.exit();
  }

  #switch(view) {
    this.#view = view;
    for (const [id, button] of Object.entries(this.#tabs)) button.setAttribute('aria-selected', String(id === view));
    this.#stage.replaceChildren(view === 'grid' ? this.#grid.el : this.#mixer.el);
  }

  #detailEmpty() {
    this.#detail.replaceChildren(el('p', { class: 'detail__empty', text: this.#view === 'grid' ? 'Tap a box in the chart to see and hear it.' : 'Make a syllable.' }));
  }

  #pick(syllable) {
    this.#picked = syllable;
    this.#grid.select(syllable);
    this.services.audio.play('click');
    this.#detail.replaceChildren(
      el('span', { class: 'detail__big', text: syllable.text }),
      el('span', { class: 'detail__sum', text: `${syllable.consonant.char} + ${signOnItsOwn(syllable.sign)} = ${syllable.text}` }),
      createButton({ label: 'Hear it', icon: '🔊', variant: 'accent', onClick: () => this.voice.say(syllableParts(syllable)) }));
    this.voice.say(syllableParts(syllable));
  }
}

