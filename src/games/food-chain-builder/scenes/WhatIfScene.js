import { FoodScene } from './FoodScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { scorePrediction, explainEffect } from '../logic/whatIf.js';
import { combinedStars } from '../logic/scoring.js';

const CHOICES = Object.freeze([
  { value: 'up', label: 'More', symbol: '↑' },
  { value: 'same', label: 'Same', symbol: '＝' },
  { value: 'down', label: 'Fewer', symbol: '↓' },
]);

/**
 * "What if?" (Hard): one living thing disappears from the habitat. For every other card the child says whether there
 * would be more of it (↑), the same (＝) or fewer (↓). The answers come from the habitat's data, which a test proves
 * follows a one-step rule: what eats the missing thing goes down, what it eats goes up, the rest stay the same.
 */
export class WhatIfScene extends FoodScene {
  #habitat = null;
  #round = null;
  #answers = {};
  #checked = false;
  #rows = new Map();
  #buttons = {};
  #resultEl = null;

  /** @param {{ habitat: import('../logic/habitats.js').Habitat, builderStars: 1|2|3, wrongAtFirstCheck: number }} round */
  enter(round) {
    const { services, data } = this;
    this.#round = round;
    this.#habitat = round.habitat;
    const { whatIf } = this.#habitat;
    if (!whatIf) throw new GameError('NO_WHAT_IF', `${this.#habitat.id} has no "What if?"`, { habitatId: this.#habitat.id });
    const removed = data.lookup.get(whatIf.removed);

    const hud = createHud({ homeHref: services.game.homeHref, title: `${this.data.places.find((p) => p.id === this.#habitat.place).name} · What if?`, onSettings: () => services.openSettings() });
    this.#resultEl = el('div', { class: 'whatif__result', attrs: { role: 'status' } });
    this.#buttons.check = createButton({ label: 'Check my answers', icon: '✔', variant: 'primary', big: true, disabled: true, onClick: () => this.#checkAnswers() });

    const rows = this.#habitat.organisms.filter((id) => id !== whatIf.removed).map((id) => this.#row(data.lookup.get(id)));
    this.ui.append(hud.el, el('main', { class: 'whatif' },
      el('h1', { class: 'whatif__title', text: `What if all the ${removed.plural} disappeared?` }),
      el('div', { class: 'whatif__gone' }, el('span', { class: 'whatif__icon', text: removed.icon, attrs: { 'aria-hidden': 'true' } }), el('span', { text: `${removed.name}: gone!` })),
      el('p', { class: 'whatif__help', text: 'For each living thing, will there be more of it (↑), about the same (＝) or fewer (↓)? Think about who eats whom.' }),
      el('div', { class: 'whatif__rows' }, ...rows),
      this.#buttons.check, this.#resultEl));
  }

  #row(organism) {
    const name = `predict-${organism.id}`;
    const inputs = CHOICES.map((choice) => {
      const input = el('input', { attrs: { type: 'radio', name, value: choice.value }, on: { change: () => { this.#answers[organism.id] = choice.value; this.#syncCheck(); } } });
      return el('label', { class: 'predict__choice' }, input, el('span', {}, el('span', { class: 'predict__symbol', text: choice.symbol, attrs: { 'aria-hidden': 'true' } }), ` ${choice.label}`));
    });
    const row = el('fieldset', { class: 'predict' },
      el('legend', { class: 'predict__who' }, el('span', { text: organism.icon, attrs: { 'aria-hidden': 'true' } }), ` ${organism.name}`),
      el('div', { class: 'predict__choices' }, ...inputs),
      el('p', { class: 'predict__why' }));
    this.#rows.set(organism.id, row);
    return row;
  }

  #syncCheck() {
    const asked = this.#habitat.organisms.length - 1;
    setDisabled(this.#buttons.check, this.#checked || Object.keys(this.#answers).length < asked);
  }

  #checkAnswers() {
    if (this.#checked) return;
    this.#checked = true;
    const { services, data } = this;
    const { whatIf } = this.#habitat;
    const removed = data.lookup.get(whatIf.removed);
    const score = scorePrediction(this.#answers, whatIf.effects);
    for (const [id, row] of this.#rows) {
      const right = !score.wrongIds.includes(id);
      row.classList.add(right ? 'is-right' : 'is-wrong');
      for (const input of row.querySelectorAll('input')) input.disabled = true;
      const why = row.querySelector('.predict__why');
      why.replaceChildren(el('span', { html: right ? ICONS.check : ICONS.cross, attrs: { 'aria-hidden': 'true' } }), ` ${explainEffect(whatIf.effects[id], data.lookup.get(id), removed)}`);
    }
    const stars = combinedStars(this.#round.builderStars, score.correct, score.total);
    services.audio.play(score.wrongIds.length === 0 ? 'cheer' : score.correct >= score.total * 0.7 ? 'ding' : 'boop');
    setDisabled(this.#buttons.check, true);
    this.#resultEl.replaceChildren(
      el('p', { class: 'whatif__score', text: `${score.correct} of ${score.total} right.` }),
      el('p', { class: 'whatif__note', text: 'This is just the first step. In a real habitat the changes keep spreading through the whole food web!' }));
    const finish = createButton({
      label: 'See my results', icon: '⭐', variant: 'primary', big: true,
      onClick: () => this.routes.results({ ...this.#round, stars, whatIf: { correct: score.correct, total: score.total } }),
    });
    this.#resultEl.append(finish);
    finish.focus();
  }
}
