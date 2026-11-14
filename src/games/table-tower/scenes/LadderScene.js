import { TowerBase } from './TowerBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { isFloor, levelOfFloor, FACTS_PER_FLOOR } from '../logic/levels.js';
import { createLadder, submitRung, hintFor, revealText } from '../logic/ladder.js';
import { parseAnswer } from '../logic/questions.js';

/** After the last rung, the ladder is shown for this long before the results. */
const CELEBRATE_SECONDS = 1.4;
const TONE_ICON = { good: '✔', bad: '✖', info: 'ℹ' };

/** Practice: "fill the ladder". Each rung is the next multiple of the table (17, 34, 51 ...). */
export class LadderScene extends TowerBase {
  #floor = 0;
  #level = null;
  #ladder = null;
  #hud = null;
  #rungsEl = null;
  #input = null;
  #noteEl = null;
  #celebrate = 0;

  /** @param {{ floor: number }} params */
  enter({ floor }) {
    const { services } = this;
    if (!isFloor(floor)) throw new GameError('BAD_FLOOR', `There is no floor ${floor}`, { floor });
    this.#floor = floor;
    this.#level = levelOfFloor(floor);
    this.#ladder = createLadder(floor);

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: `Floor ${floor}: Ladder`,
      stats: [{ id: 'rung', label: 'Rung' }, { id: 'mistakes', label: 'Mistakes' }],
      onSettings: () => services.openSettings(),
    });
    this.#rungsEl = el('ol', { class: 'ladder', attrs: { 'aria-label': `The ${floor} times table ladder, top rung last` } });
    this.#noteEl = el('p', { class: 'ladder__note', attrs: { role: 'status' } });
    this.#input = el('input', { class: 'answer__input', attrs: { id: 'rung-input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, autocomplete: 'off', 'aria-describedby': 'rung-note' } });
    this.#noteEl.id = 'rung-note';
    const form = el('form', { class: 'answer', on: { submit: (event) => { event.preventDefault(); this.#submit(); } } },
      el('label', { class: 'answer__label', attrs: { for: 'rung-input' }, text: 'What is the next rung?' }),
      el('div', { class: 'answer__row' }, this.#input, createButton({ label: 'Climb', icon: '🧗', variant: 'primary' })));
    form.querySelector('button').type = 'submit';

    this.ui.classList.add('ladder-scene');
    this.ui.append(this.#hud.el, el('div', { class: 'practice' },
      el('p', { class: 'practice__lead', text: this.#level.id === 'easy' ? `Count up in ${floor}s. Each rung is ${floor} more than the one below.` : `Fill every rung of the ${floor} times table, from the bottom.` }),
      el('div', { class: 'practice__body' }, this.#rungsEl, el('div', { class: 'practice__side' }, form, this.#noteEl))));
    this.#say(hintFor(this.#ladder), 'info');
    this.#draw();
    this.#input.focus({ preventScroll: true });
  }

  #draw() {
    const ladder = this.#ladder;
    const showJumps = this.#level.id === 'easy';
    this.#rungsEl.replaceChildren(...Array.from({ length: FACTS_PER_FLOOR }, (_, i) => {
      const number = i + 1;
      const filled = number <= ladder.filled;
      const isNext = !ladder.done && number === ladder.filled + 1;
      const shown = ladder.shown.includes(number);
      return el('li', { class: `rung${filled ? ' is-filled' : ''}${isNext ? ' is-next' : ''}${shown ? ' is-shown' : ''}`, attrs: isNext ? { 'aria-current': 'step' } : {} },
        el('span', { class: 'rung__times', text: `× ${number}` }),
        el('span', { class: 'rung__value', text: filled ? String(this.#floor * number) : '?' }),
        el('span', { class: 'rung__climber', text: isNext ? '🧗' : '', attrs: { 'aria-hidden': 'true' } }),
        showJumps && number > 1 ? el('span', { class: 'rung__jump', text: `+${this.#floor}`, attrs: { 'aria-hidden': 'true' } }) : null);
    }));
    this.#hud.setStat('rung', `${Math.min(ladder.filled + 1, FACTS_PER_FLOOR)}/${FACTS_PER_FLOOR}`);
    this.#hud.setStat('mistakes', ladder.mistakes);
  }

  #say(text, tone) {
    this.#noteEl.className = `ladder__note ladder__note--${tone}`;
    this.#noteEl.replaceChildren(
      el('span', { class: 'ladder__note-icon', text: TONE_ICON[tone], attrs: { 'aria-hidden': 'true' } }),
      el('span', { text }));
  }

  #submit() {
    if (this.#ladder.done) return;
    const { services } = this;
    const value = parseAnswer(this.#input.value);
    if (value === null) {
      this.#say('Type a whole number, like 34.', 'info');
      this.#input.focus({ preventScroll: true });
      return;
    }
    const before = this.#ladder;
    const result = submitRung(before, value);
    this.#ladder = result.ladder;
    this.#input.value = '';
    if (result.correct) {
      services.audio.play('ding');
      services.speech.speak(String(result.expected));
      this.#say(this.#ladder.done ? `${result.expected}! You reached the top!` : `${result.expected}! ${hintFor(this.#ladder)}`, 'good');
    } else if (result.revealed) {
      services.audio.play('boop');
      this.#say(revealText(before, result.expected), 'bad');
    } else {
      services.audio.play('boop');
      this.#say(`Not ${value}. ${hintFor(before)}`, 'bad');
    }
    this.#draw();
    if (this.#ladder.done) {
      services.audio.play('cheer');
      if (this.#ladder.mistakes === 0) launchConfetti({ rng: services.rng });
      this.#celebrate = CELEBRATE_SECONDS;
      this.#input.disabled = true;
    } else {
      this.#input.focus({ preventScroll: true });
    }
  }

  update(dt) {
    if (this.#celebrate <= 0) return;
    this.#celebrate -= dt;
    if (this.#celebrate <= 0) this.routes.results({ kind: 'ladder', floor: this.#floor, levelId: this.#level.id, mistakes: this.#ladder.mistakes });
  }
}

