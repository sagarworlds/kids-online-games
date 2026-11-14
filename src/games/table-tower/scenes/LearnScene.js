import { TowerBase } from './TowerBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { isFloor, FACTS_PER_FLOOR } from '../logic/levels.js';
import { trickFor } from '../logic/splits.js';
import { createNumberLine } from '../ui/NumberLine.js';
import { createSplitGrid } from '../ui/SplitGrid.js';

/** Learn mode: cards for one table (skip counting on a number line, the split grid, and a trick if the floor has one). */
export class LearnScene extends TowerBase {
  #index = 0;
  #cards = [];
  #body = null;
  #counter = null;
  #back = null;
  #next = null;

  /** @param {{ floor: number }} params */
  enter({ floor }) {
    const { services } = this;
    if (!isFloor(floor)) throw new GameError('BAD_FLOOR', `There is no floor ${floor}`, { floor });
    const trick = trickFor(floor);
    this.#cards = [
      { title: `Count in jumps of ${floor}`, build: () => el('div', {}, el('p', { class: 'learn__lead', text: `A times table is skip counting. Press Jump to hop along in ${floor}s.` }), createNumberLine({ table: floor, onJump: (to) => services.speech.speak(String(to)) }).el) },
      { title: 'Split the sum into easy parts', build: () => el('div', {}, el('p', { class: 'learn__lead', text: 'Big sums are easier in pieces. Split the table into tens and ones, work each out, then add.' }), this.createSplitGrid(floor).el) },
      ...(trick ? [{ title: trick.title, build: () => this.#trickCard(trick) }] : []),
    ];

    const hud = createHud({ homeHref: services.game.homeHref, title: `Floor ${floor}: Learn`, onSettings: () => services.openSettings() });
    this.#body = el('div', { class: 'learn__card' });
    this.#counter = el('p', { class: 'learn__count', attrs: { 'aria-live': 'polite' } });
    this.#back = createButton({ label: 'Back', icon: '◀', onClick: () => this.#go(-1) });
    this.#next = createButton({ label: 'Next', icon: '▶', variant: 'primary', onClick: () => this.#go(1) });
    this.ui.append(hud.el, el('div', { class: 'learn' },
      this.#counter, this.#body,
      el('div', { class: 'learn__nav' }, this.#back, this.#next),
      el('div', { class: 'result__actions' },
        createButton({ label: 'Try the ladder', icon: '🪜', variant: 'accent', onClick: () => this.routes.ladder(floor) }),
        createButton({ label: 'Back to the floor', onClick: () => this.routes.floor(floor) }))));
    this.#show();
  }

  /**
   * Makes the grid picture of a split sum. The 3D version of this scene overrides it to show 3D slabs instead of flat blocks (the
   * rows to choose and the written working are the same). The lessons and the Ladder and Challenge afterwards are this class.
   * @param {number} table
   * @returns {ReturnType<typeof createSplitGrid>}
   */
  createSplitGrid(table) {
    return createSplitGrid({ table });
  }

  /** Called just before another card is shown, or when the scene ends: the place to free a card's 3D picture. */
  releaseCard() {}

  /** Draws the card being shown again (a 3D scene that has to drop its 3D picture mid-lesson uses this to show it flat). */
  refreshCard() {
    this.#show();
  }

  exit() {
    this.releaseCard();
  }

  #trickCard(trick) {
    const lines = el('ol', { class: 'trick__lines' });
    const answer = el('p', { class: 'trick__answer', attrs: { role: 'status' } });
    const chips = el('div', { class: 'sg__chips', attrs: { role: 'group', 'aria-label': `Times ${trick.floor} by` } });
    const pick = (m) => {
      const { lines: steps, result } = trick.steps(m);
      lines.replaceChildren(...steps.map((line) => el('li', { text: line })));
      answer.textContent = `${trick.floor} × ${m} = ${result}`;
      for (const chip of chips.children) chip.setAttribute('aria-pressed', String(Number(chip.dataset.m) === m));
    };
    for (let m = 1; m <= FACTS_PER_FLOOR; m++) chips.append(el('button', { class: 'chip', text: String(m), data: { m: String(m) }, attrs: { type: 'button', 'aria-label': `${trick.floor} times ${m}` }, on: { click: () => pick(m) } }));
    pick(7);
    return el('div', { class: 'trick' }, el('p', { class: 'trick__rule', text: trick.rule }), el('p', { class: 'sg__ask', text: 'Try it on:' }), chips, lines, answer);
  }

  #go(step) {
    this.#index = Math.min(this.#cards.length - 1, Math.max(0, this.#index + step));
    this.services.audio.play('click');
    this.#show();
  }

  #show() {
    this.releaseCard();
    const card = this.#cards[this.#index];
    this.#body.replaceChildren(el('h1', { class: 'learn__title', text: card.title }), card.build());
    this.#counter.textContent = `Card ${this.#index + 1} of ${this.#cards.length}`;
    setDisabled(this.#back, this.#index === 0);
    setDisabled(this.#next, this.#index === this.#cards.length - 1);
  }
}
