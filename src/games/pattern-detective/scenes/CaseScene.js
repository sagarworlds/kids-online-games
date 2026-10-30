import { DetectiveScene } from './DetectiveScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { CASES_PER_ROUND } from '../logic/levels.js';
import { same } from '../logic/equality.js';
import { createItemView, describeItem } from '../ui/ItemView.js';

/** One case: look at the sequence, work out the rule, and pick what goes in the gap. */
export class CaseScene extends DetectiveScene {
  #puzzle = null;
  #wrongPicks = 0;
  #solved = false;
  #optionEls = [];
  #cellEls = [];
  #gapEls = [];
  #slotEl = null;
  #hud = null;
  #hintEl = null;
  #hintBox = null;
  #magnifier = null;
  #ruleEl = null;
  #stampEl = null;
  #afterEl = null;
  #announcer = null;
  #offs = [];

  /** @param {import('./DetectiveScene.js').Round} round */
  enter(round) {
    const { services } = this;
    this.round = round;
    this.#puzzle = round.puzzles[round.index];
    if (!this.#puzzle) throw new GameError('NO_CASE', `Round has no case number ${round.index}`, { index: round.index });
    this.#buildDom();
    this.#offs.push(services.input.on('key', (event) => this.#onKey(event)));
  }

  exit() {
    for (const off of this.#offs) off();
    this.#offs = [];
  }

  // ------------------------------------------------------------------ DOM

  #buildDom() {
    const { services, round } = this;
    const puzzle = this.#puzzle;
    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'case', label: 'Case' }, { id: 'clean', label: 'First try' }],
      onSettings: () => services.openSettings(),
    });
    this.#hud.setStat('case', `${round.index + 1}/${CASES_PER_ROUND}`);
    this.#hud.setStat('clean', round.results.filter((r) => r.firstTry).length);

    // The sequence: each item in a cell, with a small gap between cells where a hint can write the jump (+4, ×2).
    const strip = el('ol', { class: 'strip', attrs: { 'aria-label': 'The pattern. One item is missing.' } });
    puzzle.items.forEach((item, i) => {
      const hidden = i === puzzle.missingIndex;
      const cell = el('li', { class: `cell${hidden ? ' cell--missing' : ''}`, attrs: { 'aria-label': hidden ? 'Missing item' : describeItem(item) } },
        hidden ? el('span', { class: 'item item--missing', text: '?', attrs: { 'aria-hidden': 'true' } }) : createItemView(item),
        el('span', { class: 'cell__label', attrs: { 'aria-hidden': 'true' } }));
      if (hidden) this.#slotEl = cell;
      this.#cellEls.push(cell);
      strip.append(cell);
      if (i < puzzle.items.length - 1) {
        const gap = el('li', { class: 'gap', attrs: { 'aria-hidden': 'true' } });
        this.#gapEls.push(gap);
        strip.append(gap);
      }
    });

    this.#stampEl = el('div', { class: 'stamp', text: 'SOLVED!', attrs: { 'aria-hidden': 'true' } });
    this.#stampEl.hidden = true;
    this.#ruleEl = el('p', { class: 'case__rule' });
    this.#ruleEl.hidden = true;
    const file = el('section', { class: 'file', attrs: { 'aria-label': `Case ${round.index + 1}` } },
      el('h2', { class: 'file__title', text: `Case file #${round.index + 1}` }), strip, this.#stampEl, this.#ruleEl);

    this.#magnifier = el('span', { class: 'magnifier', text: '🔍', attrs: { 'aria-hidden': 'true' } });
    this.#hintEl = el('p', { class: 'case__hint' });
    const hintBox = el('div', { class: 'hintbox', attrs: { role: 'status' } }, this.#magnifier, this.#hintEl);
    hintBox.hidden = true;
    this.#hintBox = hintBox;

    this.#optionEls = puzzle.options.map((option, i) => el('button', {
      class: 'option', attrs: { type: 'button', 'aria-label': `${describeItem(option)}. Key ${i + 1}` },
      on: { click: (event) => { this.#pick(i); if (event.detail > 0) event.currentTarget.blur(); } },
    }, el('span', { class: 'option__key', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }), createItemView(option)));
    const options = el('div', { class: 'options', attrs: { role: 'group', 'aria-label': 'Which one comes next? Keys 1 to 4' } }, ...this.#optionEls);

    this.#afterEl = el('div', { class: 'case__after' });
    this.#announcer = el('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
    this.ui.append(this.#hud.el, el('main', { class: 'case' }, file, hintBox, options, this.#afterEl, this.#announcer));
  }

  #announce(text) {
    this.#announcer.textContent = text;
  }

  // ----------------------------------------------------------------- input

  #onKey(event) {
    if (this.#solved || event.repeat) return;
    if (/^[1-4]$/.test(event.key)) this.#pick(Number(event.key) - 1);
  }

  #pick(index) {
    const option = this.#puzzle.options[index];
    const button = this.#optionEls[index];
    if (this.#solved || option === undefined || button.disabled) return;
    if (same(option, this.#puzzle.answer)) this.#onSolved(index);
    else this.#onWrong(index);
  }

  #onWrong(index) {
    this.#wrongPicks += 1;
    this.services.audio.play('boop');
    const button = this.#optionEls[index];
    button.disabled = true;
    button.classList.add('is-wrong');
    this.#showHint();
    this.#announce(`Not that one. ${this.#puzzle.hint.text}`);
  }

  /** The magnifying glass: wiggles, and shows the hint for this kind of pattern. */
  #showHint() {
    const { hint } = this.#puzzle;
    this.#hintEl.textContent = hint.text;
    this.#hintBox.hidden = false;
    this.#magnifier.classList.remove('wiggle');
    void this.#magnifier.offsetWidth; // restart the animation on every wrong pick
    this.#magnifier.classList.add('wiggle');
    (hint.highlight ?? []).forEach((i) => this.#cellEls[i]?.classList.add('is-circled'));
    (hint.labels ?? []).forEach((label, i) => { this.#cellEls[i].querySelector('.cell__label').textContent = label ?? ''; });
    (hint.between ?? []).forEach((label, i) => { this.#gapEls[i].textContent = label ?? ''; });
    // Nothing is written in a gap for the hidden item, so the child still has to work that one out.
    this.#slotEl.querySelector('.cell__label')?.replaceChildren();
  }

  #onSolved(index) {
    const { services, round } = this;
    const puzzle = this.#puzzle;
    this.#solved = true;
    services.audio.play(this.#wrongPicks === 0 ? 'cheer' : 'ding');
    for (const button of this.#optionEls) button.disabled = true;
    this.#optionEls[index].classList.add('is-right');

    // The answer drops into the gap, the stamp lands on the file, and the rule is spelled out.
    this.#slotEl.classList.remove('cell--missing');
    this.#slotEl.classList.add('cell--solved');
    this.#slotEl.setAttribute('aria-label', describeItem(puzzle.answer));
    this.#slotEl.replaceChildren(createItemView(puzzle.answer), el('span', { class: 'cell__label', attrs: { 'aria-hidden': 'true' } }));
    this.#stampEl.hidden = false;
    this.#ruleEl.textContent = puzzle.ruleText;
    this.#ruleEl.hidden = false;
    this.#hintBox.hidden = true;
    this.#announce(`Solved! ${puzzle.ruleText}`);

    const last = round.index + 1 >= round.puzzles.length;
    const result = { type: puzzle.type, firstTry: this.#wrongPicks === 0, wrongPicks: this.#wrongPicks };
    const next = createButton({
      label: last ? 'See results' : 'Next case', icon: '▶', variant: 'primary', big: true,
      onClick: () => {
        const nextRound = { ...round, index: round.index + 1, results: [...round.results, result] };
        if (last) this.routes.results(nextRound);
        else this.routes.play(nextRound);
      },
    });
    this.#afterEl.append(next);
    next.focus();
  }
}
