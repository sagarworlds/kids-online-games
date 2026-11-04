import { TowerBase } from './TowerBase.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { createProgressBar } from '../../../engine/ui/ProgressBar.js';
import { LEVELS, isFloor, levelOfFloor, isFloorOpen, challengeSeconds } from '../logic/levels.js';
import { buildChallenge, buildRevision, QuizSession } from '../logic/session.js';
import { makeChoices, parseAnswer, describeAnswer } from '../logic/questions.js';
import { workingFor } from '../logic/splits.js';

/** After a right answer the next question follows after this many seconds. */
const NEXT_AFTER_RIGHT = 0.6;

/** Minutes and seconds, counting a part second as a whole one, so the clock reads 0:00 only when time is up. */
const formatTime = (seconds) => {
  const whole = Math.ceil(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * The Challenge (every fact of a floor, against the clock) and Revision (facts that need practice, no clock). They run the
 * same way: a question, an answer, and the right working shown after a miss.
 */
export class QuizScene extends TowerBase {
  #mode = 'challenge';
  #floor = null;
  #level = null;
  #session = null;
  #phase = 'asking';
  #paused = new Set();
  #wait = 0;
  #shownSecond = -1;
  #offs = [];
  #choiceButtons = [];
  #choiceValues = [];

  #hud = null;
  #promptEl = null;
  #answerEl = null;
  #feedbackEl = null;
  #nextButton = null;
  #input = null;
  #timeBar = null;

  /** @param {{ mode: 'challenge'|'revision', floor?: number, levelId: 'easy'|'medium'|'hard' }} params */
  enter({ mode, floor, levelId }) {
    const { services } = this;
    this.#level = LEVELS[levelId];
    if (!this.#level) throw new GameError('UNKNOWN_LEVEL', `There is no level "${levelId}"`, { levelId });
    this.#mode = mode;
    const rng = services.rng;
    if (mode === 'challenge') {
      if (!isFloor(floor) || levelOfFloor(floor).id !== levelId) throw new GameError('BAD_FLOOR', `Floor ${floor} is not in the ${levelId} level`, { floor, levelId });
      if (!isFloorOpen(floor, this.cleared())) throw new GameError('FLOOR_LOCKED', `Floor ${floor} is not open yet`, { floor });
      this.#floor = floor;
      const questions = buildChallenge({ floor, level: this.#level, memory: this.memory(), clearedBefore: [...this.cleared()], rng });
      this.#session = new QuizSession({ questions, seconds: challengeSeconds(this.#level) });
    } else if (mode === 'revision') {
      const questions = buildRevision({ level: this.#level, memory: this.memory(), today: this.today(), rng });
      if (questions.length === 0) throw new GameError('NOTHING_TO_REVISE', 'Revision needs at least one fact the child has met');
      this.#session = new QuizSession({ questions, requeue: true });
    } else {
      throw new GameError('UNKNOWN_MODE', `There is no mode "${mode}"`, { mode });
    }

    this.#buildDom();
    this.#offs.push(
      services.input.on('key', (event) => this.#onKey(event)),
      services.input.on('visibility', ({ hidden }) => this.#setPause('hidden', hidden)),
    );
    this.#ask();
  }

  exit() {
    for (const off of this.#offs) off();
    this.#offs = [];
  }

  // ------------------------------------------------------------------ DOM

  #buildDom() {
    const { services } = this;
    const timed = this.#mode === 'challenge';
    this.#hud = createHud({
      homeHref: services.game.homeHref,
      title: timed ? `Floor ${this.#floor}: Challenge` : 'Revision',
      stats: [{ id: 'q', label: 'Question' }, ...(timed ? [{ id: 'time', label: 'Time' }] : [])],
      onSettings: () => this.#openSettings(),
    });
    this.#promptEl = el('h1', { class: 'quiz__prompt', attrs: { 'aria-live': 'polite' } });
    this.#answerEl = el('div', { class: 'quiz__answer' });
    this.#feedbackEl = el('div', { class: 'quiz__feedback', attrs: { role: 'status' } });
    this.#nextButton = createButton({ label: 'Next', icon: '▶', variant: 'primary', big: true, onClick: () => this.#next() });
    this.#nextButton.hidden = true;
    if (timed) this.#timeBar = createProgressBar({ label: 'Time left', max: Math.round(this.#session.secondsLeft), value: this.#session.secondsLeft });

    this.ui.classList.add('quiz-scene');
    this.ui.append(this.#hud.el, el('main', { class: 'quiz' },
      timed ? this.#timeBar.el : null, this.#promptEl, this.#answerEl, this.#feedbackEl, el('div', { class: 'quiz__actions' }, this.#nextButton)));
  }

  /** Shows the question to answer now. */
  #ask() {
    const { services } = this;
    const question = this.#session.current;
    this.#phase = 'asking';
    this.#feedbackEl.replaceChildren();
    this.#feedbackEl.className = 'quiz__feedback';
    this.#nextButton.hidden = true;
    this.#promptEl.textContent = question.prompt;
    this.#hud.setStat('q', `${this.#session.position}/${this.#session.total}`);
    services.speech.speak(question.spoken);

    if (this.#level.answerMode === 'choice') {
      this.#choiceValues = makeChoices(question, services.rng);
      this.#choiceButtons = this.#choiceValues.map((value, i) => createButton({
        label: String(value), className: 'choice', ariaLabel: `${value}. Press ${i + 1}.`, onClick: () => this.#answer(value),
      }));
      this.#answerEl.replaceChildren(el('div', { class: 'choices' }, ...this.#choiceButtons));
    } else {
      this.#input = el('input', { class: 'answer__input', attrs: { id: 'quiz-input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, autocomplete: 'off', 'aria-label': 'Your answer' } });
      const submit = createButton({ label: 'Check', icon: '✔', variant: 'primary' });
      submit.type = 'submit';
      this.#answerEl.replaceChildren(el('form', { class: 'answer', on: { submit: (event) => { event.preventDefault(); this.#submitTyped(); } } },
        el('div', { class: 'answer__row' }, this.#input, submit)));
      this.#input.focus({ preventScroll: true });
    }
  }

  #submitTyped() {
    if (this.#phase !== 'asking' || this.#paused.size > 0) return;
    const value = parseAnswer(this.#input.value);
    if (value === null) {
      this.#feedbackEl.textContent = 'Type a whole number.';
      this.#input.focus({ preventScroll: true });
      return;
    }
    this.#answer(value);
  }

  // --------------------------------------------------------------- answers

  #answer(value) {
    if (this.#phase !== 'asking' || this.#paused.size > 0) return;
    const result = this.#session.answer(value);
    if (!result) return;
    const { services } = this;
    this.#phase = 'feedback';
    this.#lockAnswer(result, value);
    if (result.correct) {
      services.audio.play('ding');
      this.#showFeedback('good', '✔ Correct!');
      this.#wait = NEXT_AFTER_RIGHT;
    } else {
      services.audio.play('boop');
      const q = result.question;
      this.#showFeedback('bad', `✖ ${describeAnswer(q)}`, workingFor(q.table, q.multiplier));
      this.#nextButton.hidden = false;
      this.#nextButton.focus({ preventScroll: true });
    }
  }

  /** Stops further answers and marks the choices: a tick on the right one and a cross on the one picked wrongly. */
  #lockAnswer(result, picked) {
    if (this.#level.answerMode === 'choice') {
      this.#choiceButtons.forEach((button, i) => {
        setDisabled(button, true);
        const value = this.#choiceValues[i];
        if (value === result.expected) button.classList.add('is-right');
        else if (value === picked) button.classList.add('is-wrong');
      });
    } else {
      this.#input.disabled = true;
    }
  }

  #showFeedback(tone, text, working) {
    this.#feedbackEl.className = `quiz__feedback quiz__feedback--${tone}`;
    this.#feedbackEl.replaceChildren(el('p', { class: 'quiz__verdict', text }), working ? el('p', { class: 'quiz__working', text: working }) : null);
  }

  #next() {
    if (this.#phase !== 'feedback') return;
    this.#wait = 0;
    this.#session.advance();
    if (this.#session.over) this.#finish();
    else this.#ask();
  }

  #finish() {
    this.#phase = 'done';
    this.routes.results({ kind: this.#mode, floor: this.#floor ?? undefined, levelId: this.#level.id, summary: this.#session.summary() });
  }

  // ----------------------------------------------------------------- input

  #onKey(event) {
    if (this.#phase !== 'asking' || this.#paused.size > 0 || this.#level.answerMode !== 'choice' || event.repeat) return;
    if (/^[1-4]$/.test(event.key)) this.#answer(this.#choiceValues[Number(event.key) - 1]);
  }

  async #openSettings() {
    this.#setPause('settings', true);
    try {
      await this.services.openSettings();
    } finally {
      this.#setPause('settings', false);
    }
  }

  #setPause(reason, on) {
    if (on) this.#paused.add(reason);
    else this.#paused.delete(reason);
  }

  // ------------------------------------------------------------------ loop

  update(dt) {
    if (this.#phase === 'done' || this.#paused.size > 0) return;
    if (this.#phase === 'feedback') {
      if (this.#wait > 0) {
        this.#wait -= dt;
        if (this.#wait <= 0) this.#next();
      }
      return;
    }
    // The clock runs only while a question is waiting for an answer, so reading the working after a miss costs no time.
    if (this.#mode !== 'challenge') return;
    const timedOut = this.#session.tick(dt);
    const left = this.#session.secondsLeft;
    const second = Math.ceil(left);
    if (second !== this.#shownSecond) {
      this.#shownSecond = second;
      this.#hud.setStat('time', formatTime(left));
      this.#timeBar.set(left);
    }
    if (timedOut) this.#finish();
  }
}
